import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { SITE_URL } from "@/lib/config.generated";
import { DATASET } from "@/lib/headers";
import { indexable } from "@/lib/indexing";
import { searchIndex } from "@/lib/schedule";
import { STATIC_PAGES } from "@/lib/static-pages";

// Rendered at build from the cached search index (no DB read of its own; the
// build reads it for the home page anyway), kept on the CDN, refreshed hourly
// as lib/schedule.ts's CACHE (next.config.ts `dataset`), and purged with it
// by POST /api/revalidate through the index's `dataset` tag.

const PAGES = ["/", ...STATIC_PAGES.map(({ path }) => path)];

// Two URLs per place, as their canonical links (components/place-page.tsx):
// its address page and its waste subpage (/adres/<id>/smieci); never the
// /nr/ or /numer variants, PDFs or calendars, and no place we have no pickup
// data for (its pages are noindex).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // While gated, proxy.ts blocks it anyway.
  if (!indexable()) return [];
  return [
    // The home page as its canonical link has it (no trailing slash).
    ...PAGES.map((path) => ({
      url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    })),
    ...(await placeUrls()),
  ];
}

// A route handler caches through a function of its own
// (nextjs.org/docs/app/guides/migrating-to-cache-components).
async function placeUrls(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("dataset");
  cacheTag(DATASET);
  const { places, noData } = await searchIndex();
  const skip = new Set(noData);
  return places
    .filter(([id]) => !skip.has(id))
    .flatMap(([id]) => {
      const url = `${SITE_URL}/adres/${encodeURIComponent(id)}`;
      return [{ url }, { url: `${url}/smieci` }];
    });
}
