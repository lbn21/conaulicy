import "server-only";
import { get, put } from "@vercel/blob";
import { cacheLife, cacheTag } from "next/cache";
import { LIVE } from "./headers.ts";
import { type ImgwRead, imgwCopyOf } from "./imgw-shown.ts";
import { upstream as imgwUpstream } from "./imgw-warnings.ts";
import { liveCopyOf, PGE_KEY, UNREADABLE } from "./live-status.ts";
import { parseOutagesFile, upstream as pgeUpstream } from "./pge-feed.ts";
import type { PgeRead } from "./power-module.ts";

// The private Blob store (BLOB_READ_WRITE_TOKEN): the crons' files, read
// and written by the crons, and read by the pages' live data, from the
// Blob's origin, behind Next's cache: each read is cached as "live"
// (next.config.ts, tagged LIVE), so a page has it in its prerendered HTML,
// and the cron purges LIVE after it writes (app/api/cron/zuk), so the next
// request reads the new file. LIVE_STORE_DIR (scripts/check-freshness.mjs)
// keeps the files in a directory instead, never in production.

/** IMGW's last good feed, only our powiats' items (lib/imgw-cron.ts). */
export const FEED_PATH = "imgw/feed.json";

/** PGE's last good list, only our area's outages (lib/pge-cron.ts). */
export const PGE_PATH = "pge/outages.json";

/** Every source's last check (lib/live-status.ts, lib/zuk-cron.ts). */
export const CHECKS_PATH = "status/checks.json";

/** LIVE_STORE_DIR, outside production only: the store as a directory. */
function storeDir(): string | null {
  if (process.env.VERCEL_ENV === "production") return null;
  return process.env.LIVE_STORE_DIR || null;
}

/**
 * A file's body, or null if there is none yet. Throws on other errors.
 * From the Blob's origin; `cdn`: through its CDN (the dataset's immutable
 * versions, lib/dataset.ts).
 */
export async function readBlobFile(
  pathname: string,
  { cdn = false }: { cdn?: boolean } = {},
): Promise<string | null> {
  const dir = storeDir();
  if (dir) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return readFile(join(dir, pathname), "utf8").catch(() => null);
  }
  const blob = await get(pathname, { access: "private", useCache: cdn });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

export async function writeBlobFile(
  pathname: string,
  body: string,
): Promise<void> {
  const dir = storeDir();
  if (dir) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");
    await mkdir(dirname(join(dir, pathname)), { recursive: true });
    return writeFile(join(dir, pathname), body);
  }
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

/** A mock's two files for the pages (lib/imgw-mock.ts, lib/pge-mock.ts). */
type MockFiles = (url: string, now: number) => Promise<LiveFiles>;
type LiveFiles = { feed: string | null; checks: string | null };

/**
 * A live feed's last good copy for the pages, from the store (cached by
 * its callers as "live"); pages never ask the upstream. `url` is
 * the upstream's: a "mock:…" one (outside production only, its upstream()
 * refuses it there) reads the mock's files instead (no Blob needed). null:
 * the cron has written none yet. The store unreadable, or its file not
 * one: UNREADABLE, an expected error as a value, which the pages render as
 * a notice (Next.js, "Handling expected errors"); every page renders as
 * ever.
 */
async function liveRead<C>(
  name: string,
  url: string,
  path: string,
  mock: () => Promise<MockFiles>,
  copyOf: (feed: string | null, checks: string | null) => C | null,
): Promise<C | null | typeof UNREADABLE> {
  try {
    if (url.startsWith("mock:")) {
      const { feed, checks } = await (await mock())(url, Date.now());
      return copyOf(feed, checks);
    }
    const [feed, checks] = await Promise.all([
      readBlobFile(path),
      readBlobFile(CHECKS_PATH),
    ]);
    return copyOf(feed, checks);
  } catch (error) {
    console.warn(`${name} store: unreadable (${(error as Error).message})`);
    return UNREADABLE;
  }
}

/**
 * IMGW's last good feed and its last good check: the weather module's
 * (lib/modules.ts). `preview`: ?imgw= (lib/imgw-preview.ts), the mock,
 * outside production only.
 */
export async function imgwCopy(
  preview: string | null = null,
): Promise<ImgwRead> {
  "use cache";
  cacheLife("live");
  cacheTag(LIVE);
  return liveRead(
    "IMGW",
    preview ?? (await imgwUpstream()).url,
    FEED_PATH,
    async () => (await import("./imgw-mock.ts")).mockFiles,
    imgwCopyOf,
  );
}

/** PGE's last good list and its last good check: the power module's. */
export async function pgeCopy(): Promise<PgeRead> {
  "use cache";
  cacheLife("live");
  cacheTag(LIVE);
  return liveRead(
    "PGE",
    (await pgeUpstream()).url,
    PGE_PATH,
    async () => (await import("./pge-mock.ts")).mockFiles,
    (feed, checks) => liveCopyOf(parseOutagesFile(feed), checks, PGE_KEY),
  );
}
