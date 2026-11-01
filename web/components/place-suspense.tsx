import { type ReactNode, Suspense } from "react";
import { HUB_SHAPE } from "@/components/hub";
import { BlockSkeleton } from "@/components/live-block";
import { LIVE_SHAPE } from "@/components/module-page";
import { Skeleton } from "@/components/skeleton";

// The address pages read their place from the URL (params) behind
// <Suspense>, so their route's App Shell, shared by every link to it, holds
// no place and a default <Link> prefetches it (task 231, Jakub's decision;
// nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense).
// After a click the place streams in; a prerendered place's full load has
// it in its static HTML, after the skeleton (React's hidden <div>).
// The fallback is the page's typical shape, so it reserves about the final
// height and the footer stays put (nextjs.org/docs/app/getting-started/caching:
// a fallback that reserves space; task 235): the h1's line, „Zmień adres”,
// then the page's own shapes, the live blocks' too.

// „Zmień adres” (components/place-page.tsx PlaceHeading), spaced as there.
const CHANGE = (
  <p className="govuk-body govuk-!-margin-bottom-6">
    <Skeleton>Zmień adres</Skeleton>
  </p>
);

const SHAPES = {
  /** The address page (components/hub.tsx). */
  hub: (
    <>
      <p className="govuk-heading-l">
        <Skeleton>ul. Adama Mickiewicza</Skeleton>
      </p>
      {CHANGE}
      {HUB_SHAPE}
    </>
  ),
  /**
   * A module's subpage (components/module-page.tsx), one shape for every
   * module, as the module is in the params too: the live one's, the
   * place as its caption. The waste subpage, its whole schedule, is taller.
   */
  subpage: (
    <>
      <span className="govuk-caption-l">
        <Skeleton>Lubaczów, ul. Adama Mickiewicza</Skeleton>
      </span>
      <p className="govuk-heading-l">
        <Skeleton>Przerwy w dostawie wody</Skeleton>
      </p>
      {CHANGE}
      {LIVE_SHAPE}
    </>
  ),
};

/** An address page's content (`children` awaits the params), as above. */
export function PlaceSuspense({
  shape,
  children,
}: {
  shape: keyof typeof SHAPES;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <BlockSkeleton>{SHAPES[shape]}</BlockSkeleton>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
