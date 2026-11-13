import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";
import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { searchIndex } from "@/lib/schedule";
import { STATIC_PAGES } from "@/lib/static-pages";

// Prerendered at build from the search index of the dataset snapshot
// (lib/dataset.ts), re-rendered with the dataset (its tag,
// lib/page-cache.ts); a new place set is a new deployment, so it never
// lists a page the build did not make.

export const dynamic = "error";

const PAGES = ["/", ...STATIC_PAGES.map(({ path }) => path)];

// Two URLs per place, as their canonical links (components/place-page.tsx):
// its address page and its waste subpage (/adres/<id>/smieci); never a
// query, PDFs or calendars, and no place we have no pickup
// data for (its pages are noindex).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexable()) return [];
  return [
    // The home page as its canonical link has it (no trailing slash).
    ...PAGES.map((path) => ({
      url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    })),
    ...(await placeUrls()),
  ];
}

async function placeUrls(): Promise<MetadataRoute.Sitemap> {
  const { places, noData } = await pageData(
    "/sitemap.xml",
    [SOURCE_TAGS.dataset],
    async () => {
      const { places, noData } = await searchIndex();
      return { places, noData };
    },
  );
  const skip = new Set(noData);
  return places
    .filter(([id]) => !skip.has(id))
    .flatMap(([id]) => {
      const url = `${SITE_URL}/adres/${encodeURIComponent(id)}`;
      return [{ url }, { url: `${url}/smieci` }];
    });
}
