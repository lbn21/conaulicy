import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import {
  AddressSearch,
  SearchErrorProvider,
  SearchErrorSummary,
} from "@/components/address-search";
import { ImgwLive } from "@/components/imgw-banner";
import { PageMain } from "@/components/page-main";
import { SearchResults } from "@/components/search-results";
import { ResultsSkeleton } from "@/components/search-skeleton";
import { DATASET } from "@/lib/headers";
import { indexable } from "@/lib/indexing";
import { searchIndexUrl } from "@/lib/schedule";
import { pageMetadata } from "@/lib/share";

// The search form's list (components/address-search.tsx: „Szukaj” opens one
// place itself and comes here for several or none). A static page, from the
// CDN like every other: the IMGW banner in its own hole; the heading and
// the field (empty) in the static shell; the results rendered on the device
// from ?q= (components/search-results.tsx), at once after „Szukaj”, or
// behind a skeleton of one result (components/search-skeleton.tsx) until
// the index is in. GOV.UK's search results: the heading, the field, then the
// results. Never indexed (next.config.ts sends the header too). One title
// and one heading for every outcome: the page is static, so they cannot
// depend on the query.

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
      <SearchBody />
    </PageMain>
  );
}

// Cached until the next import or deploy: the index's URL changes with the
// dataset, which the import purges.
async function SearchBody() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  const indexUrl = await searchIndexUrl();
  return (
    <SearchErrorProvider>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <SearchErrorSummary />
          <h1 className="govuk-heading-l">Wyszukaj adres</h1>
          <div className="govuk-!-margin-bottom-8">
            <AddressSearch indexUrl={indexUrl} />
          </div>
          <Suspense fallback={<ResultsSkeleton />}>
            <SearchResults indexUrl={indexUrl} />
          </Suspense>
        </div>
      </div>
    </SearchErrorProvider>
  );
}
