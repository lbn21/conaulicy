import "server-only";
import { unstable_cache } from "next/cache";

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
 * The sources a page may read, each one tag: the dataset snapshot (import,
 * POST /api/revalidate; the day's first cron run), and the live sources
 * the zuk cron writes (lib/live-refresh.ts).
 */
export const SOURCE_TAGS = {
  dataset: "dataset",
  imgw: "imgw",
  pge: "pge",
  water: "water",
} as const;

export type SourceTag = (typeof SOURCE_TAGS)[keyof typeof SOURCE_TAGS];

/** A page's own tag: `page:/adres/0972447-00470/woda`. */
const pageTag = (path: string) => `page:${path}`;

/**
 * A page's data, read once per render of `path`, cached with the page's
 * tags. `load` must return plain JSON (unstable_cache stores it as JSON):
 * no Date, Map or Set; it reads the clock itself, and gives it back for
 * the page to render with.
 */
export function pageData<T>(
  path: string,
  sources: SourceTag[],
  load: () => Promise<T>,
): Promise<T> {
  return unstable_cache(load, ["page", path], {
    tags: [pageTag(path), ...sources],
  })();
}
