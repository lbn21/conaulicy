import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { LIVE } from "./headers.ts";
import { readBlobFile, writeBlobFile } from "./live-store.ts";
import {
  GMINA,
  WATER_SOURCES,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { parseZukFile, type ZukData, zukView } from "./zuk-data.ts";

// Each water source's file in the private Blob store (lib/live-store.ts,
// lib/water-sources.ts pathname): written by the cron, read by the cron
// and, cached as "live" (getWaterData, lib/live-store.ts), by the pages.

/** A file's body, or null if there is none yet. Throws on other errors. */
export function readZukFile(pathname = GMINA.pathname): Promise<string | null> {
  return readBlobFile(pathname);
}

export function writeZukFile(
  body: string,
  pathname = GMINA.pathname,
): Promise<void> {
  return writeBlobFile(pathname, body);
}

/**
 * ZUK_MOCK (the gmina's) and MZGKIM_MOCK, each a fixture post's id, its id
 * with "-stale", or "none", serve a fixture file (lib/water-fixture.ts
 * mockFile) instead of the Blob, as PGE_API_URL's mock (lib/pge-feed.ts):
 * anywhere but production (VERCEL_ENV), so CI's built site and `next dev`
 * on db:local show a dated cut on the fixture's town street (t370).
 */
async function mockView(
  source: WaterSource,
  now: Date,
): Promise<ZukData | null> {
  const name =
    source.id === "mzgkim" ? process.env.MZGKIM_MOCK : process.env.ZUK_MOCK;
  if (!name) return null;
  if (process.env.VERCEL_ENV === "production") {
    console.error("ZUK_MOCK, MZGKIM_MOCK: the mock is off in production");
    return null;
  }
  const { mockFile } = await import("./water-fixture.ts");
  const file = mockFile(name, now.getTime());
  return file === undefined ? null : zukView(file, now, source);
}

/**
 * One source's water cuts and notices for the pages (lib/water-module.ts).
 * No file, or one older than an hour: `stale` (lib/zuk-data.ts).
 */
async function sourceData(source: WaterSource, now: Date): Promise<ZukData> {
  const mock = await mockView(source, now);
  if (mock) return mock;
  let body: string | null = null;
  try {
    body = await readBlobFile(source.pathname);
  } catch (error) {
    console.error(`${source.pathname}: ${(error as Error).message}`);
  }
  return zukView(body ? parseZukFile(body) : null, now, source);
}

/**
 * Every source's data, by its id: what lib/water-module.ts water() takes.
 * Cached as "live" (lib/live-store.ts): its stale flags count from the
 * cache's fill.
 */
export async function getWaterData(): Promise<Record<WaterSourceId, ZukData>> {
  "use cache";
  cacheLife("live");
  cacheTag(LIVE);
  const now = new Date();
  const views = await Promise.all(WATER_SOURCES.map((s) => sourceData(s, now)));
  return Object.fromEntries(
    WATER_SOURCES.map((s, i) => [s.id, views[i]]),
  ) as Record<WaterSourceId, ZukData>;
}
