import type { ReactNode } from "react";
import { CRUMBS_CLASS } from "@/components/breadcrumbs";
import { GovukFrontend } from "@/components/govuk-frontend";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { Skeleton } from "@/components/skeleton";

// The address pages and their subpages: one skeleton, one reveal (Jakub's
// decision, task 239). The page's content (its params, then every block's
// data at once: components/hub.tsx hubData, components/module-page.tsx
// subpageData) sits behind one <Suspense> (react.dev/reference/react/Suspense),
// so it all comes in together, after the slowest block. The skeleton is
// generic, not the page's shape, so a new section needs no new one: the
// h1's bar, „Zmień adres”'s, then four section cards, a little more than
// the first screen on a phone (390×844) and a desktop (1280×800). The
// skeleton and the page are both at least a screen tall (app-place,
// app/site.scss: min-height 100vh), so the footer is below the first
// screen before and after the reveal, whatever the page's length, and
// nothing moves into view when a short page (/woda with no cuts) takes the
// skeleton's place (task 240; web.dev/articles/optimize-cls, reserve the
// space). The route's App Shell, shared by every
// link to it, holds only this: no place, no date
// (nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense).

/** A section card: a heading's bar and two lines'. */
const CARD = (
  <div className="app-skeleton-card govuk-!-padding-4 govuk-!-margin-bottom-6">
    <p className="govuk-heading-s">
      <Skeleton>Najbliższe dni</Skeleton>
    </p>
    <p className="govuk-body">
      <Skeleton>Tego dnia odbiorą: zmieszane, papier</Skeleton>
    </p>
    <p className="govuk-body govuk-!-margin-bottom-0">
      <Skeleton>Sprawdziliśmy 1 listopada</Skeleton>
    </p>
  </div>
);

const SKELETON = (
  <div className="govuk-grid-row">
    <div className="govuk-grid-column-two-thirds">
      <BlockSkeleton>
        <p className="govuk-heading-l">
          <Skeleton>ul. Adama Mickiewicza</Skeleton>
        </p>
        <p className="govuk-body govuk-!-margin-bottom-6">
          <Skeleton>Zmień adres</Skeleton>
        </p>
        {CARD}
        {CARD}
        {CARD}
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
    <div className="app-place">
      <LiveBlock skeleton={SKELETON}>
        {children}
        <GovukFrontend />
      </LiveBlock>
    </div>
  );
}
