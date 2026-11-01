import { type ReactNode, Suspense } from "react";
import { HUB_SHAPE } from "@/components/hub";
import { BlockSkeleton } from "@/components/live-block";
import { LIVE_SHAPE } from "@/components/module-page";
import { blank, Skeleton } from "@/components/skeleton";
import { CALENDAR_CHECK } from "@/components/subpage-parts";
import { BinsSkeleton } from "@/components/waste-bins";

// The address pages read their place from the URL (params) behind
// <Suspense>, so their route's App Shell, shared by every link to it, holds
// no place and a default <Link> prefetches it (task 231, Jakub's decision;
// nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense).
// After a click the place streams in; a prerendered place's full load has
// it in its static HTML, after the skeleton (React's hidden <div>).
// The fallback is the page's typical first screen (nextjs.org/docs/app/getting-started/caching:
// a fallback that reserves space; task 237), so what a click shows at once
// stays put when the page comes in: the h1's line, „Zmień adres”, then the
// page's own shapes, the live blocks' too. Below the first screen it is
// left simple: every address's page is as long as its own content.

// „Zmień adres” (components/place-page.tsx PlaceHeading), spaced as there.
const CHANGE = (
  <p className="govuk-body govuk-!-margin-bottom-6">
    <Skeleton>Zmień adres</Skeleton>
  </p>
);

// A subpage's caption, the place.
const CAPTION = (
  <span className="govuk-caption-l">
    <Skeleton>Lubaczów, ul. Adama Mickiewicza</Skeleton>
  </span>
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
   * A live module's subpage (components/module-page.tsx), one shape for
   * every one, as the module is in the params too: the water's.
   */
  live: (
    <>
      {CAPTION}
      <p className="govuk-heading-l">
        <Skeleton>Przerwy w dostawie wody</Skeleton>
      </p>
      {CHANGE}
      {LIVE_SHAPE}
    </>
  ),
  /**
   * The waste subpage (components/place-page.tsx WasteDetails), its own
   * route (app/adres/[id]/smieci): its checked line, the calendar's button,
   * hint and details, the PDF link, then the next pickup's big date and its
   * first bins (components/pickup-schedule.tsx NextPickup). The button's
   * shape is GOV.UK's button box (app/site.scss).
   */
  waste: (
    <>
      {CAPTION}
      <p className="govuk-heading-l">
        <Skeleton>Odbiór śmieci</Skeleton>
      </p>
      {CHANGE}
      <p className="govuk-hint govuk-!-font-size-16">
        <Skeleton>Wywozy sprawdziliśmy: 1 listopada, 5:17</Skeleton>
      </p>
      <span className="govuk-button app-skeleton">
        {blank("Dodaj do kalendarza")}
      </span>
      <p className="govuk-body">
        <Skeleton>Plik z datami wywozu.</Skeleton>
      </p>
      <div className="govuk-details">
        <p className="govuk-body govuk-!-margin-bottom-1">
          <Skeleton>{CALENDAR_CHECK}</Skeleton>
        </p>
      </div>
      <p className="govuk-body">
        <Skeleton>Harmonogram do druku (PDF)</Skeleton>
      </p>
      {/* In its own <div>, as NextPickup's: right after a govuk-body,
          GOV.UK's `.govuk-body + .govuk-heading-s` would pad the date. */}
      <div className="govuk-!-margin-bottom-6">
        <p className="govuk-heading-s govuk-!-margin-bottom-3">
          <span className="govuk-!-display-block govuk-!-font-size-27">
            <Skeleton>Najbliższy odbiór</Skeleton>
          </span>
          <span className="govuk-!-display-block govuk-!-font-size-80">
            <Skeleton>12</Skeleton>
          </span>
          <span className="govuk-!-display-block govuk-!-font-size-24">
            <Skeleton>listopada, czwartek</Skeleton>
          </span>
        </p>
        <BinsSkeleton labels={["Zmieszane", "Papier", "Szkło"]} size="large" />
      </div>
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
