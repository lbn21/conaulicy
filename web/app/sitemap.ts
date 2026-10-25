import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";
import { searchIndex } from "@/lib/schedule";
import { STATIC_PAGES } from "@/lib/static-pages";

// Rendered at build from the cached search index (no DB read of its own; the
// build reads it for the home page anyway), kept on the CDN, refreshed hourly
// as lib/schedule.ts's CACHE, and purged with it by POST /api/revalidate
// through the index's `dataset` tag.
export const revalidate = 3600;

const PAGES = ["/", ...STATIC_PAGES.map(({ path }) => path)];

// Two URLs per place, as their canonical links (components/place-page.tsx):
// its address page and its waste subpage (/adres/<id>/smieci); never the
// /nr/ or /numer variants, PDFs or calendars, and no place we have no pickup
// data for (its pages are noindex).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // While gated, proxy.ts blocks it anyway.
  if (!indexable()) return [];
  const { places, noData } = await searchIndex();
  const skip = new Set(noData);
  return [
    ...PAGES.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...places
      .filter(([id]) => !skip.has(id))
      .flatMap(([id]) => {
        const url = `${SITE_URL}/adres/${encodeURIComponent(id)}`;
        return [{ url }, { url: `${url}/smieci` }];
      }),
  ];
}
