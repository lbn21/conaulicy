import { cacheLife, cacheTag } from "next/cache";
import { type ReactNode, Suspense } from "react";
import { CRUMBS_CLASS, HOME_CRUMB } from "@/components/breadcrumbs";
import { PlaceBreadcrumbs } from "@/components/place-page";
import { Skeleton } from "@/components/skeleton";
import { numberParam } from "@/lib/address-routes";
import { findSubpage } from "@/lib/modules";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";

/**
 * The address pages' breadcrumbs, as the root layout's @breadcrumbs slot
 * renders them, before the layout's one <main> (app/layout.tsx,
 * docs/layout.md): the address page's (`module` null), or a module
 * subpage's. Nothing where the page is a 404: an unknown place, an unknown
 * module, or a module without its data (as HubMain and ModuleMain decide).
 * Cached as the pages' shells are (cacheLife "max", the place's tags).
 */
async function PlaceCrumbs({
  id,
  nr,
  module = null,
}: {
  id: string;
  nr: string | null;
  module?: string | null;
}) {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const subpage = module === null ? null : findSubpage(module);
  if (module !== null && !subpage) return null;
  const [place, data] = await Promise.all([
    getPlace(id, nr),
    subpage && !subpage.live ? subpage.load(id, nr) : null,
  ]);
  if (!place || (subpage && !subpage.live && !data)) return null;
  return <PlaceBreadcrumbs place={place} subpage={subpage !== null} />;
}

/**
 * An address page's @breadcrumbs route (app/@breadcrumbs/adres/[id]/…),
 * one body for all of them: its params awaited behind CrumbsSuspense, as
 * the page's own (components/place-suspense.tsx). `subpage` for a module's
 * subpage; `module` for the waste subpage's own route, whose params hold no
 * module (components/subpage-route.tsx).
 */
export function CrumbsRoute({
  params,
  module,
  subpage = module !== undefined,
}: {
  params: Promise<{ id: string; module?: string; nr?: string[] }>;
  module?: string;
  subpage?: boolean;
}) {
  return (
    <CrumbsSuspense subpage={subpage}>
      <CrumbsContent params={params} module={module} />
    </CrumbsSuspense>
  );
}

async function CrumbsContent({
  params,
  module: fixed,
}: {
  params: Promise<{ id: string; module?: string; nr?: string[] }>;
  module?: string;
}) {
  const { id, module = fixed, nr } = await params;
  return (
    <PlaceCrumbs
      id={id}
      nr={nr ? numberParam(nr) : null}
      module={module ?? null}
    />
  );
}

/**
 * The breadcrumbs behind their params (`children`), the fallback the
 * trail's typical width, so the page under it stays put (tasks 235 and 237):
 * on a subpage the address too, which wraps on a phone as the trail does.
 * Hidden from assistive technology: the page's own fallback says
 * „Sprawdzamy…”.
 */
function CrumbsSuspense({
  subpage,
  children,
}: {
  subpage: boolean;
  children: ReactNode;
}) {
  const trail = `${HOME_CRUMB.label} Lubaczów${subpage ? " ul. Adama Mickiewicza" : ""}`;
  return (
    <Suspense
      fallback={
        <div className={CRUMBS_CLASS} aria-hidden="true">
          <ol className="govuk-breadcrumbs__list">
            <li className="govuk-breadcrumbs__list-item">
              <Skeleton>{trail}</Skeleton>
            </li>
          </ol>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
