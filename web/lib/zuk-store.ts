import "server-only";
import { readBlobFile, writeBlobFile } from "./live-store.ts";
import {
  GMINA,
  WATER_SOURCES,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { parseZukFile, type ZukData, zukView } from "./zuk-data.ts";

// Each water source's file in the private Blob store (lib/live-store.ts,
// lib/water-sources.ts pathname): the cron reads its origin, the pages'
// live blocks its CDN copy, per request (at most 60 s behind a write).

/**
 * A file's body from the Blob's origin, or null if there is none yet.
 * Throws on other errors.
 */
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
 * `next dev` only: ZUK_MOCK (the gmina's) and MZGKIM_MOCK, each a fixture
 * post's id, its id with "-stale", or "none", serve a fixture file
 * (lib/water-fixture.ts mockFile) instead of the Blob. Any build (Vercel's
 * included) runs with NODE_ENV=production, so it can never be on there.
 */
async function mockView(
  source: WaterSource,
  now: Date,
): Promise<ZukData | null> {
  const name =
    source.id === "mzgkim" ? process.env.MZGKIM_MOCK : process.env.ZUK_MOCK;
  if (!name) return null;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL_ENV === "production"
  ) {
    console.error("ZUK_MOCK, MZGKIM_MOCK: ignored outside next dev");
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
    body = await readBlobFile(source.pathname, { cdn: true });
  } catch (error) {
    console.error(`${source.pathname}: ${(error as Error).message}`);
  }
  return zukView(body ? parseZukFile(body) : null, now, source);
}

/** Every source's data, by its id: what lib/water-module.ts water() takes. */
export async function getWaterData(
  now = new Date(),
): Promise<Record<WaterSourceId, ZukData>> {
  const views = await Promise.all(WATER_SOURCES.map((s) => sourceData(s, now)));
  return Object.fromEntries(
    WATER_SOURCES.map((s, i) => [s.id, views[i]]),
  ) as Record<WaterSourceId, ZukData>;
}
