import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";
import { searchIndex } from "@/lib/schedule";
import { sitePages } from "@/lib/site-pages";

// Rendered at build from the cached search index (no DB read of its own; the
// build reads it for the home page anyway), kept on the CDN, refreshed hourly
// as lib/schedule.ts's CACHE, and purged with it by POST /api/revalidate
// through the index's `dataset` tag.
export const revalidate = 3600;

// Two URLs per place, as their canonical links (components/place-page.tsx):
// its address page and its waste subpage; the route map is lib/site-pages.ts,
// which the cron's warming reads too (lib/warm.ts).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // While gated, proxy.ts blocks it anyway.
  if (!indexable()) return [];
  const { places, noData } = await searchIndex();
  // The home page as its canonical link has it (no trailing slash).
  return sitePages(places, noData).map(({ path }) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
  }));
}
