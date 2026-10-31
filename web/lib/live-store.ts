import "server-only";
import { get, put } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { IMGW } from "./headers.ts";
import { type ImgwCopy, imgwCopyOf } from "./imgw-banner.ts";
import { upstream } from "./imgw-warnings.ts";

// The private Blob store (BLOB_READ_WRITE_TOKEN): the cron's files, and the
// pages' cached reader of IMGW's. Each read is from the Blob's origin, not
// its CDN copy (up to 60 s old): a read right after a purge gets the new
// file.

/** IMGW's last good feed, only our powiats' items (lib/imgw-cron.ts). */
export const FEED_PATH = "imgw/feed.json";

/** Every source's last check (lib/live-status.ts, lib/zuk-cron.ts). */
export const CHECKS_PATH = "status/checks.json";

/** A file's body, or null if there is none yet. Throws on other errors. */
export async function readBlobFile(pathname: string): Promise<string | null> {
  const blob = await get(pathname, {
    access: "private",
    useCache: false,
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
    readBlobFile(FEED_PATH),
    readBlobFile(CHECKS_PATH),
  ]);
  return { feed, checks };
}

// Through Next's data cache, tagged IMGW: every page reading it carries the
// tag too, so the cron's purge after every good check (lib/zuk-cron.ts)
// drops the entry and those pages. A read that throws is not kept: the
// pages keep their last render (docs/data/imgw.md).
const cachedFiles = unstable_cache(imgwFiles, ["imgw-files"], {
  tags: [IMGW],
  revalidate: 600,
});

/**
 * The last good copy of IMGW's feed and its last good check, or null when
 * the cron has written none yet: the banner's (components/imgw-banner.tsx)
 * and the weather module's (lib/modules.ts). Pages never ask IMGW. Throws
 * when the store cannot be read, or its feed file is not one.
 */
export async function imgwCopy(): Promise<ImgwCopy | null> {
  const { url } = await upstream();
  const { feed, checks } = await cachedFiles(
    url.startsWith("mock:") ? url : "blob",
  );
  return imgwCopyOf(feed, checks);
}
