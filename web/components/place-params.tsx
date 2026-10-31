import type { ReactNode } from "react";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { Skeleton } from "@/components/skeleton";

// The address pages read their place from the URL (params) behind
// <Suspense>, as Partial Prefetching asks
// (nextjs.org/docs/app/guides/adopting-partial-prefetching#move-url-data-behind-suspense):
// a link prefetches its route's App Shell, one for every place, which can
// hold no URL data. Read outside a boundary, the shell's page segment never
// resolved, and the prefetch never ended (task 228). So the shell has the
// place's skeleton (its breadcrumbs, caption, h1 and „Zmień adres”, in
// their own elements and GOV.UK classes, so as tall as they will be), shown
// at once on a client-side navigation until the place's own static part
// arrives. A full load of a prerendered place gets its page in the HTML, as
// before: its params are known at build. The reveal and pulse are a live
// block's (components/live-block.tsx), none under prefers-reduced-motion.

/** `children` with the page's params, behind `skeleton`. */
export function PlaceParams<T>({
  params,
  skeleton,
  children,
}: {
  params: Promise<T>;
  skeleton: ReactNode;
  children: (params: T) => ReactNode;
}) {
  return (
    <LiveBlock skeleton={skeleton}>
      <Resolved params={params}>{children}</Resolved>
    </LiveBlock>
  );
}

async function Resolved<T>({
  params,
  children,
}: {
  params: Promise<T>;
  children: (params: T) => ReactNode;
}) {
  return children(await params);
}

// A place's name as it typically is.
const NAME = "ul. Adama Mickiewicza";

/** The top of a place's page: a subpage's caption, the h1, „Zmień adres”. */
function Top({ caption }: { caption: boolean }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <BlockSkeleton>
          {caption && (
            <span className="govuk-caption-l">
              <Skeleton>{`Lubaczów, ${NAME}`}</Skeleton>
            </span>
          )}
          <p className="govuk-heading-l">
            <Skeleton>{caption ? "Odbiór śmieci" : NAME}</Skeleton>
          </p>
          <p className="govuk-body govuk-!-margin-bottom-6">
            <Skeleton>Zmień adres</Skeleton>
          </p>
        </BlockSkeleton>
      </div>
    </div>
  );
}

/** The address page's (the hub's) top while its place comes. */
export const HUB_SKELETON = <Top caption={false} />;

/** A module subpage's top while its place comes. */
export const SUBPAGE_SKELETON = <Top caption />;

/** Breadcrumbs (components/breadcrumbs.tsx) while the place comes. */
function Crumbs({ items }: { items: string[] }) {
  return (
    <BlockSkeleton>
      <div className="govuk-breadcrumbs govuk-!-margin-top-7">
        <ol className="govuk-breadcrumbs__list">
          {items.map((item) => (
            <li key={item} className="govuk-breadcrumbs__list-item">
              <Skeleton>{item}</Skeleton>
            </li>
          ))}
        </ol>
      </div>
    </BlockSkeleton>
  );
}

/** The address page's breadcrumbs: home, the locality. */
export const HUB_CRUMBS_SKELETON = (
  <Crumbs items={["Strona główna", "Lubaczów"]} />
);

/** A subpage's breadcrumbs: home, the locality, the address page. */
export const SUBPAGE_CRUMBS_SKELETON = (
  <Crumbs items={["Strona główna", "Lubaczów", NAME]} />
);
