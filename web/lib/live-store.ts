import "server-only";
import { get, put } from "@vercel/blob";
import { type ImgwRead, imgwCopyOf } from "./imgw-shown.ts";
import { upstream as imgwUpstream } from "./imgw-warnings.ts";
import { liveCopyOf, PGE_KEY, UNREADABLE } from "./live-status.ts";
import { parseOutagesFile, upstream as pgeUpstream } from "./pge-feed.ts";
import type { PgeRead } from "./power-module.ts";

// The private Blob store (BLOB_READ_WRITE_TOKEN): the crons' files, read
// and written by the crons, and read by the pages' live blocks
// (components/live-block.tsx), per request. The crons read the Blob's
// origin, so a run compares against the last write; the pages read its
// CDN copy, at most 60 s behind a write (vercel.com/docs/vercel-blob,
// "Caching"; every file is written with the minimum cacheControlMaxAge,
// 60 s), so no page needs a purge.

/** IMGW's last good feed, only our powiats' items (lib/imgw-cron.ts). */
export const FEED_PATH = "imgw/feed.json";

/** PGE's last good list, only our area's outages (lib/pge-cron.ts). */
export const PGE_PATH = "pge/outages.json";

/** Every source's last check (lib/live-status.ts, lib/zuk-cron.ts). */
export const CHECKS_PATH = "status/checks.json";

/**
 * A file's body, or null if there is none yet. Throws on other errors.
 * From the Blob's origin (the crons); `cdn`: through its CDN (the pages).
 */
export async function readBlobFile(
  pathname: string,
  { cdn = false }: { cdn?: boolean } = {},
): Promise<string | null> {
  const blob = await get(pathname, {
    access: "private",
    useCache: cdn,
  });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

export async function writeBlobFile(
  pathname: string,
  body: string,
): Promise<void> {
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
 * A live feed's last good copy for the pages, read per request through the
 * Blob's CDN, never cached by Next; pages never ask the upstream. `url` is
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
      readBlobFile(path, { cdn: true }),
      readBlobFile(CHECKS_PATH, { cdn: true }),
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
  return liveRead(
    "PGE",
    (await pgeUpstream()).url,
    PGE_PATH,
    async () => (await import("./pge-mock.ts")).mockFiles,
    (feed, checks) => liveCopyOf(parseOutagesFile(feed), checks, PGE_KEY),
  );
}
