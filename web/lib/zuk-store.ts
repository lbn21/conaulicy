import "server-only";
import { parseChecks, waterKey } from "./live-status.ts";
import { CHECKS_PATH, readBlobFile, writeBlobFile } from "./live-store.ts";
import {
  GMINA,
  WATER_SOURCES,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { parseZukFile, type ZukData, zukView } from "./zuk-data.ts";

// Each water source's file in the private Blob store (lib/live-store.ts,
// lib/water-sources.ts pathname): the cron reads its origin, the pages
// its CDN copy when they are rendered (at most 60 s behind a write; the
// cron revalidates a changed source's pages after that, lib/live-refresh.ts).

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

/** A file's body through the Blob's CDN, or null: none, or unreadable. */
async function readCdn(pathname: string): Promise<string | null> {
  try {
    return await readBlobFile(pathname, { cdn: true });
  } catch (error) {
    console.error(`${pathname}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * One source's water cuts and notices for the pages (lib/water-module.ts).
 * No file, or no good check for an hour (its file or, as the file is
 * written only when it changed, the status file): `stale`
 * (lib/zuk-data.ts).
 */
async function sourceData(
  source: WaterSource,
  now: Date,
  checks: () => Promise<string | null>,
): Promise<ZukData> {
  const mock = await mockView(source, now);
  if (mock) return mock;
  const body = await readCdn(source.pathname);
  const lastCheck =
    parseChecks(await checks())?.sources[waterKey(source.id)]?.checkedAt ??
    null;
  return zukView(body ? parseZukFile(body) : null, now, source, lastCheck);
}

/** Every source's data, by its id: what lib/water-module.ts water() takes. */
export async function getWaterData(
  now = new Date(),
): Promise<Record<WaterSourceId, ZukData>> {
  let read: Promise<string | null> | undefined;
  const checks = () => {
    read ??= readCdn(CHECKS_PATH);
    return read;
  };
  const views = await Promise.all(
    WATER_SOURCES.map((s) => sourceData(s, now, checks)),
  );
  return Object.fromEntries(
    WATER_SOURCES.map((s, i) => [s.id, views[i]]),
  ) as Record<WaterSourceId, ZukData>;
}
