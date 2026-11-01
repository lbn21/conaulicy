import { type ReactNode, Suspense } from "react";
import { BlockSkeleton } from "@/components/live-block";
import { Skeleton } from "@/components/skeleton";

// The address pages read their place from the URL (params) behind
// <Suspense>, so their route's App Shell, shared by every link to it, holds
// no place and a default <Link> prefetches it (task 231, Jakub's decision;
// nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense).
// After a click the place streams in; a prerendered place's full load has
// it in its static HTML, after the skeleton (React's hidden <div>).

/** The top of an address page while its place loads: its h1's line. */
const PLACE_SKELETON = (
  <div className="govuk-grid-row">
    <div className="govuk-grid-column-two-thirds">
      <BlockSkeleton>
        <p className="govuk-heading-l">
          <Skeleton>ul. Adama Mickiewicza</Skeleton>
        </p>
      </BlockSkeleton>
    </div>
  </div>
);

/** An address page's content (`children` awaits the params), as above. */
export function PlaceSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={PLACE_SKELETON}>{children}</Suspense>;
}
