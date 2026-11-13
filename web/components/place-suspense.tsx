import type { ReactNode } from "react";
import { CRUMBS_CLASS } from "@/components/breadcrumbs";
import { GovukFrontend } from "@/components/govuk-frontend";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { PageHead } from "@/components/page-head";
import { Skeleton } from "@/components/skeleton";
import type { SubpageId } from "@/lib/module-ids";
import { findSubpage, type Module } from "@/lib/modules";

// The address pages and their subpages: one skeleton, one reveal.
// The page's content (its params, then every block's
// data at once: components/hub.tsx hubData, components/module-page.tsx
// subpageData) sits behind one <Suspense> (react.dev/reference/react/Suspense),
// so it all comes in together, after the slowest block. The skeleton is
// the page's head (a subpage's own, from its module), then one generic
// section card, so a new section needs no new one, about as tall as the
// shortest page (/woda with no cuts). No
// min-height: on a short page the footer stays put at the reveal, on a long
// one it moves down, already below the first screen. The route's App
// Shell, shared by every link to it, holds only this: no place, no date
// (nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense):
// a subpage's module is its route folder's, not a param.

/** The breadcrumbs' bar, the band's first line (components/breadcrumbs.tsx). */
const CRUMBS_SKELETON = (
  <div className={CRUMBS_CLASS}>
    <ol className="govuk-breadcrumbs__list">
      <li className="govuk-breadcrumbs__list-item">
        <Skeleton>Strona główna Lubaczów</Skeleton>
      </li>
    </ol>
  </div>
);

/** „Zmień adres”, the band's last line. */
const CHANGE = (
  <p className="govuk-body">
    <Skeleton>Zmień adres</Skeleton>
  </p>
);

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

/**
 * The skeleton. Every band's first line is the breadcrumbs' bar
 * (CRUMBS_SKELETON). The address page's band: its h1's bar and „Zmień
 * adres”'s. A subpage's band is its own page head (components/page-head.tsx,
 * as components/place-page.tsx AddressPage draws it): the place's caption
 * and „Zmień adres” as bars, its module's own title and tile, known to the
 * route (each subpage its own folder, components/subpage-route.tsx), so the
 * band wraps as the page's does at every width and text size and nothing
 * under it moves at the reveal. Its heading a <p>: the page's h1 comes with
 * the page.
 */
const skeleton = (module: Module<unknown> | null) => (
  <div className="govuk-grid-row">
    <div className="govuk-grid-column-two-thirds">
      <BlockSkeleton>
        {module ? (
          <PageHead
            tag="p"
            crumbs={CRUMBS_SKELETON}
            title={module.pageTitle}
            icon={module.id}
            caption={<Skeleton>Lubaczów, ul. Rynek</Skeleton>}
          >
            {CHANGE}
          </PageHead>
        ) : (
          <PageHead
            tag="p"
            crumbs={CRUMBS_SKELETON}
            title={<Skeleton>ul. Adama Mickiewicza</Skeleton>}
          >
            {CHANGE}
          </PageHead>
        )}
        {CARD}
      </BlockSkeleton>
    </div>
  </div>
);

/**
 * An address page's content (`children` awaits the params), as above. It
 * comes in after the layout, so it starts GOV.UK Frontend's components
 * itself (its buttons, the error summary's focus), once it is there;
 * those the layout already started are skipped.
 */
export function PlaceSuspense({
  children,
  module,
}: {
  children: ReactNode;
  /** A subpage's module: its band is its own page head. */
  module?: SubpageId;
}) {
  return (
    <LiveBlock skeleton={skeleton(module ? findSubpage(module) : null)}>
      {children}
      <GovukFrontend />
    </LiveBlock>
  );
}
