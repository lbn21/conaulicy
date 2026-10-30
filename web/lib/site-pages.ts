// The site's indexable pages and the cache tags each carries (lib/headers.ts):
// one route map for the sitemap (app/sitemap.ts) and for the cron's warming
// after a purge (lib/warm.ts). Pure, so the unit tests read it as is;
// lib/cache-tags.test.ts checks the tags against the code.
import { DAY, IMGW, WATER } from "./headers.ts";
import { STATIC_PAGES } from "./static-pages.ts";

export type SitePage = { path: string; tags: readonly string[] };

/** The address page's waste subpage, the only one listed (its canonical). */
const WASTE = "smieci";

/**
 * In sitemap order: the home page and the static pages (the IMGW banner),
 * then per place we have pickup data for, its address page (every module:
 * waste, water, weather) and its waste subpage (the day-keyed waste data
 * alone); never the /nr/ or /numer variants, the other subpages, PDFs or
 * calendars.
 */
export function sitePages(
  places: ReadonlyArray<readonly [id: string, ...unknown[]]>,
  noData: readonly string[],
): SitePage[] {
  const skip = new Set(noData);
  return [
    ...["/", ...STATIC_PAGES.map(({ path }) => path)].map((path) => ({
      path,
      tags: [IMGW],
    })),
    ...places
      .filter(([id]) => !skip.has(id))
      .flatMap(([id]) => {
        const path = `/adres/${encodeURIComponent(id)}`;
        return [
          { path, tags: [DAY, WATER, IMGW] },
          { path: `${path}/${WASTE}`, tags: [DAY] },
        ];
      }),
  ];
}
