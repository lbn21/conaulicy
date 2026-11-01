import { cacheLife, cacheTag } from "next/cache";
import { type ReactNode, Suspense } from "react";
import { CRUMBS_CLASS, HOME_CRUMB } from "@/components/breadcrumbs";
import { PlaceBreadcrumbs } from "@/components/place-page";
import { Skeleton } from "@/components/skeleton";
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
export async function PlaceCrumbs({
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
 * The address pages' @breadcrumbs routes' content (`children` awaits the
 * params, as components/place-suspense.tsx), its fallback the trail's one
 * line, so the page under it stays put (task 235). Hidden from assistive
 * technology: the page's own fallback says „Sprawdzamy…”.
 */
export function CrumbsSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className={CRUMBS_CLASS} aria-hidden="true">
          <ol className="govuk-breadcrumbs__list">
            <li className="govuk-breadcrumbs__list-item">
              <Skeleton>{`${HOME_CRUMB.label} Lubaczów`}</Skeleton>
            </li>
          </ol>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
