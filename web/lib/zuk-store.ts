import "server-only";
import { get, put } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { WATER } from "./headers.ts";
import {
  GMINA,
  WATER_SOURCES,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { parseZukFile, type ZukData, zukView } from "./zuk-data.ts";

// Each water source's file in the private Blob store
// (BLOB_READ_WRITE_TOKEN, lib/water-sources.ts pathname): read through
// Next's data cache for the pages, tagged WATER, so the cron's purge
// (lib/zuk-cron.ts) drops it and every page rendered from it (the tag is
// the pages' too). Each refill reads the Blob's origin, not its CDN copy
// (up to 60 s old): a refill right after a purge gets the new file.

/**
 * A file's body from the Blob's origin, or null if there is none yet.
 * Throws on other errors.
 */
export async function readZukFile(
  pathname = GMINA.pathname,
): Promise<string | null> {
  const blob = await get(pathname, {
    access: "private",
    useCache: false,
  });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

export async function writeZukFile(
  body: string,
  pathname = GMINA.pathname,
): Promise<void> {
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

const cached = unstable_cache(readZukFile, ["zuk-file"], {
  tags: [WATER],
  revalidate: 600,
});

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
    body = await cached(source.pathname);
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
