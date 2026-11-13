import "server-only";
import { get, put } from "@vercel/blob";

// The private Blob store (BLOB_READ_WRITE_TOKEN): the crons' files, read
// and written by the crons, and read by the pages when they are rendered.
// The crons read the Blob's origin, so a run compares against the last
// write; the pages read its CDN copy, at most 60 s behind a write
// (vercel.com/docs/vercel-blob, "Caching"; every file is written with the
// minimum cacheControlMaxAge, 60 s), so the cron revalidates the changed
// pages after that (lib/page-refresh.ts); the pages' reads: lib/live-reads.ts.

/** IMGW's last good feed, only our powiats' items (lib/imgw-cron.ts). */
export const FEED_PATH = "imgw/feed.json";

/** PGE's last good list, only our area's outages (lib/pge-cron.ts). */
export const PGE_PATH = "pge/outages.json";

/** Every source's last check (lib/live-status.ts, lib/zuk-cron.ts). */
export const CHECKS_PATH = "status/checks.json";

async function read(pathname: string, cdn: boolean): Promise<string | null> {
  const blob = await get(pathname, {
    access: "private",
    useCache: cdn,
  });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

/** A CDN read reused for this long per instance (a build, a re-render burst). */
const CDN_REUSE_MS = 10_000;
const cdnReads = new Map<
  string,
  { at: number; body: Promise<string | null> }
>();

/**
 * A file's body, or null if there is none yet. Throws on other errors.
 * From the Blob's origin (the crons, every time); `cdn`: through its CDN
 * (the pages), one read per file per CDN_REUSE_MS in an instance, so the
 * build's ~1,350 pages, or the pages re-rendered after one revalidation,
 * read each file a few times, not once per page. The CDN copy is up to
 * 60 s old anyway.
 */
export async function readBlobFile(
  pathname: string,
  { cdn = false }: { cdn?: boolean } = {},
): Promise<string | null> {
  if (!cdn) return read(pathname, false);
  const now = Date.now();
  const known = cdnReads.get(pathname);
  if (known && now - known.at < CDN_REUSE_MS) return known.body;
  const body = read(pathname, true);
  cdnReads.set(pathname, { at: now, body });
  body.catch(() => {
    if (cdnReads.get(pathname)?.body === body) cdnReads.delete(pathname);
  });
  return body;
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
