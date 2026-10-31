import "server-only";
import { get, put } from "@vercel/blob";
import { type ImgwRead, imgwCopyOf, UNREADABLE } from "./imgw-banner.ts";
import { upstream } from "./imgw-warnings.ts";

// The private Blob store (BLOB_READ_WRITE_TOKEN): the crons' files, read
// and written by the crons, and read by the pages' live blocks
// (components/live-block.tsx), per request. The crons read the Blob's
// origin, so a run compares against the last write; the pages read its
// CDN copy, at most 60 s behind a write (vercel.com/docs/vercel-blob,
// "Caching"; every file is written with the minimum cacheControlMaxAge,
// 60 s), so no page needs a purge.

/** IMGW's last good feed, only our powiats' items (lib/imgw-cron.ts). */
export const FEED_PATH = "imgw/feed.json";

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

/**
 * IMGW's two files: the Blob's, or with IMGW_WARNINGS_URL=mock:… outside
 * production (lib/imgw-warnings.ts upstream) the mock's (lib/imgw-mock.ts
 * mockFiles), keyed by `store` so the two never share an entry. Throws if
 * either cannot be read.
 */
async function imgwFiles(
  store: string,
): Promise<{ feed: string | null; checks: string | null }> {
  if (store.startsWith("mock:")) {
    const { mockFiles } = await import("./imgw-mock.ts");
    return mockFiles(store, Date.now());
  }
  const [feed, checks] = await Promise.all([
    readBlobFile(FEED_PATH, { cdn: true }),
    readBlobFile(CHECKS_PATH, { cdn: true }),
  ]);
  return { feed, checks };
}

/**
 * The last good copy of IMGW's feed and its last good check, or null when
 * the cron has written none yet: the banner's (components/imgw-banner.tsx)
 * and the weather module's (lib/modules.ts), read per request through the
 * Blob's CDN, never cached by Next. Pages never ask IMGW. The
 * store unreadable, or its feed file not one: UNREADABLE, an expected
 * error as a value, which the pages render as a notice (Next.js, "Handling
 * expected errors"); every page renders as ever.
 */
export async function imgwCopy(): Promise<ImgwRead> {
  const { url } = await upstream();
  try {
    const { feed, checks } = await imgwFiles(
      url.startsWith("mock:") ? url : "blob",
    );
    return imgwCopyOf(feed, checks);
  } catch (error) {
    console.warn(`IMGW store: unreadable (${(error as Error).message})`);
    return UNREADABLE;
  }
}
