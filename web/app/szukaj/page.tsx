import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { ImgwLive } from "@/components/imgw-banner";
import { PageMain } from "@/components/page-main";
import { SearchResults } from "@/components/search-results";
import { SearchSkeleton } from "@/components/search-skeleton";
import { DATASET } from "@/lib/headers";
import { indexable } from "@/lib/indexing";
import { searchIndexUrl } from "@/lib/schedule";
import { pageMetadata } from "@/lib/share";

// The search form's page (components/address-search.tsx: a picked
// suggestion only fills the field; „Szukaj” or Enter submits here). A
// static page, from the CDN like every other: the IMGW banner in its own
// hole, and the results column rendered on the device from ?q=
// (components/search-results.tsx), behind a skeleton of the results
// column (components/search-skeleton.tsx). Never indexed (next.config.ts
// sends the header too). One title for every outcome: the page is static,
// so it cannot depend on the query.

export const metadata: Metadata = {
  ...pageMetadata({
    path: "/szukaj",
    title: "Wyszukaj adres",
    description: "Wyniki wyszukiwania ulicy albo wsi w gminie Lubaczów.",
  }),
  robots: { index: false, follow: indexable() },
};

export default function SearchPage() {
  return (
    <PageMain>
      <ImgwLive />
      <Results />
    </PageMain>
  );
}

// Cached until the next import or deploy: the index's URL changes with the
// dataset, which the import purges.
async function Results() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  return (
    <Suspense fallback={<SearchSkeleton heading="Wyniki wyszukiwania" />}>
      <SearchResults indexUrl={await searchIndexUrl()} />
    </Suspense>
  );
}
