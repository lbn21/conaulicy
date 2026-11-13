import "server-only";
import { unstable_cache } from "next/cache";
import { cdnFile, type LiveReads, liveReads } from "./live-reads.ts";
import { digestOf } from "./page-digest.ts";

// Every page and file is prerendered whole at build (next build) and kept
// as Vercel's ISR output until one of its tags is revalidated: one cache
// scope per page (pageData), keyed by its path, tagged with the page's own
// tag and every source it reads. Revalidating a tag with the "max" profile
// marks the page stale: the next visitor gets the stale page at once and
// Vercel renders the new one in the background, which re-reads the scope
// (nextjs.org/docs/app/guides/caching-without-cache-components;
// nextjs.org/docs/app/api-reference/functions/revalidateTag). No inner
// tagged cache, so a page never renders from a stale inner entry.

/**
 * The sources a page may read, each one tag: the dataset snapshot (an
 * import's POST /api/revalidate, lib/dataset-sync.ts), and the live
 * sources the zuk cron writes. The cron revalidates a page by its own tag
 * when its digest changes (lib/page-refresh.ts).
 */
export const SOURCE_TAGS = {
  dataset: "dataset",
  imgw: "imgw",
  pge: "pge",
  water: "water",
} as const;

export type SourceTag = (typeof SOURCE_TAGS)[keyof typeof SOURCE_TAGS];

/** A page's own tag: `page:/adres/0972447-00470/woda`. */
export const pageTag = (path: string) => `page:${path}`;

/**
 * A prerendered page or file, one per path (lib/pages.ts lists them all):
 * the sources it reads (its tags) and how its view is read, the data it
 * renders. `load` must return plain JSON (unstable_cache stores it as
 * JSON): no Date, Map or Set, and no clock: pageData keeps the clock it
 * was read at beside it. The zuk cron reads every page's view the same
 * way, from the files it holds, for the page's digest (lib/page-refresh.ts).
 */
export type PageDef<V> = {
  path: string;
  sources: SourceTag[];
  load(reads: LiveReads): Promise<V>;
  /**
   * What of the view the page renders, when it renders less than its view
   * or keeps in it what is no content (the home page's run ids): the part
   * its digest hashes. Default: the whole view.
   */
  rendered?(view: V): unknown;
};

/** A page's digest of its view read at `now` (lib/page-digest.ts). */
export function pageDigest<V>(def: PageDef<V>, view: V, now: number): string {
  return digestOf(def.rendered ? def.rendered(view) : view, now);
}

/**
 * A page's view and the clock it was read at, once per render of its
 * path, cached with the page's tags; read through the Blob's CDN.
 */
export function pageData<V>(
  def: PageDef<V>,
): Promise<{ now: number; view: V }> {
  return unstable_cache(
    async () => {
      const now = Date.now();
      return { now, view: await def.load(liveReads(now, cdnFile)) };
    },
    ["page", def.path],
    { tags: [pageTag(def.path), ...def.sources] },
  )();
}
