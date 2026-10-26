import "server-only";
import { get, put } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { WATER } from "./headers.ts";
import {
  parseZukFile,
  ZUK_PATHNAME,
  type ZukData,
  zukView,
} from "./zuk-data.ts";

// The ZUK file in the private Blob store (BLOB_READ_WRITE_TOKEN): read
// through Next's data cache for the pages, tagged WATER, so the cron's
// purge (lib/zuk-cron.ts) drops it and every page rendered from it (the
// tag is the pages' too). Each refill reads the Blob's origin, not its CDN
// copy (up to 60 s old): a refill right after a purge gets the new file.

/**
 * The file's body from the Blob's origin, or null if there is none yet.
 * Throws on other errors.
 */
export async function readZukFile(): Promise<string | null> {
  const blob = await get(ZUK_PATHNAME, {
    access: "private",
    useCache: false,
  });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

export async function writeZukFile(body: string): Promise<void> {
  await put(ZUK_PATHNAME, body, {
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
 * `next dev` only: ZUK_MOCK=39885|39885-stale|none serves a fixture file
 * (lib/water-fixture.ts) instead of the Blob. Any build (Vercel's included)
 * runs with NODE_ENV=production, so it can never be on there.
 */
async function mockView(now: Date): Promise<ZukData | null> {
  const name = process.env.ZUK_MOCK;
  if (!name) return null;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL_ENV === "production"
  ) {
    console.error("ZUK_MOCK: ignored outside next dev");
    return null;
  }
  const { mockFile } = await import("./water-fixture.ts");
  const file = mockFile(name, now.getTime());
  return file === undefined ? null : zukView(file, now);
}

/**
 * ZUK's water cuts and notices for the pages (lib/water-module.ts). No
 * file, or one older than an hour: `stale` (lib/zuk-data.ts).
 */
export async function getZukData(now = new Date()): Promise<ZukData> {
  const mock = await mockView(now);
  if (mock) return mock;
  let body: string | null = null;
  try {
    body = await cached();
  } catch (error) {
    console.error(`ZUK file: ${(error as Error).message}`);
  }
  return zukView(body ? parseZukFile(body) : null, now);
}
