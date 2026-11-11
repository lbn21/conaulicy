import type { ReactNode } from "react";
import { CRUMBS_CLASS } from "@/components/breadcrumbs";
import { GovukFrontend } from "@/components/govuk-frontend";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { Skeleton } from "@/components/skeleton";

// The address pages and their subpages: one skeleton, one reveal.
// The page's content (its params, then every block's
// data at once: components/hub.tsx hubData, components/module-page.tsx
// subpageData) sits behind one <Suspense> (react.dev/reference/react/Suspense),
// so it all comes in together, after the slowest block. The skeleton is
// generic, not the page's shape, so a new section needs no new one: the
// h1's bar, „Zmień adres”'s, then one section card, about as tall as the
// shortest page (/woda with no cuts). No
// min-height: on a short page the footer stays put at the reveal, on a long
// one it moves down, already below the first screen. The route's App
// Shell, shared by every link to it, holds only this: no place, no date
// (nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense).

/** A section card: a heading's bar and two lines'. */
const CARD = (
  <div className="app-card">
    <p className="govuk-heading-s">
      <Skeleton>Najbliższe dni</Skeleton>
    </p>
    <p className="govuk-body-s">
      <Skeleton>Tego dnia odbiorą: zmieszane, papier</Skeleton>
    </p>
    <p className="govuk-body-s govuk-!-margin-bottom-0">
      <Skeleton>Sprawdziliśmy 1 listopada</Skeleton>
    </p>
  </div>
);

const SKELETON = (
  <div className="govuk-grid-row">
    <div className="govuk-grid-column-two-thirds">
      <BlockSkeleton>
        {/* The page head's band (components/page-head.tsx), as the page. */}
        <div className="app-band">
          <p className="govuk-heading-l">
            <Skeleton>ul. Adama Mickiewicza</Skeleton>
          </p>
          <p className="govuk-body">
            <Skeleton>Zmień adres</Skeleton>
          </p>
        </div>
        {CARD}
      </BlockSkeleton>
    </div>
  </div>
);

/**
 * The skeleton's first line, the breadcrumbs', in the layout's @breadcrumbs
 * slot before <main> (components/place-crumbs.tsx). Hidden from assistive
 * technology: the page's own skeleton says „Sprawdzamy…”.
 */
export const CRUMBS_SKELETON = (
  <div className={CRUMBS_CLASS} aria-hidden="true">
    <ol className="govuk-breadcrumbs__list">
      <li className="govuk-breadcrumbs__list-item">
        <Skeleton>Strona główna Lubaczów</Skeleton>
      </li>
    </ol>
  </div>
);

/**
 * An address page's content (`children` awaits the params), as above. It
 * comes in after the layout, so it starts GOV.UK Frontend's components
 * itself (its buttons, the error summary's focus), once it is there;
 * those the layout already started are skipped.
 */
export function PlaceSuspense({ children }: { children: ReactNode }) {
  return (
    <LiveBlock skeleton={SKELETON}>
      {children}
      <GovukFrontend />
    </LiveBlock>
  );
}
