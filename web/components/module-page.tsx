import type { Metadata } from "next";
import { io } from "next/cache";
import { cache, type ReactNode } from "react";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import { SubpageHeading } from "@/components/place-page";
import { findSubpage } from "@/lib/modules";
import { getPlace } from "@/lib/schedule";

// A module's subpage, /adres/[id]/[module] (lib/modules.ts), with the same
// house-number and /numer variants as the address page
// (lib/address-routes.ts), under the place's breadcrumbs (before <main>), the
// same for every module. An unknown module, or one without a subpage (the weather), is a
// 404. Canonical: the subpage itself. Read per request, whole, behind one
// <Suspense> with one skeleton, as the address page (components/hub.tsx).

export async function moduleMetadata(
  id: string,
  slug: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  const module = findSubpage(slug);
  // As placeMetadata: Next.js's own noindex is the only robots tag.
  if (!module) return NOT_FOUND_METADATA;
  return module.metadata(id, nr, missing);
}

/**
 * Everything a subpage shows, read per request (after io(), so nothing
 * date-dependent is ever prerendered: task 239), the place and the
 * module's data at once. One read per request for the page and its
 * breadcrumbs (React's cache(), as components/hub.tsx hubData). Null for
 * an unknown module.
 */
export const subpageData = cache(
  async (id: string, slug: string, nr: string | null) => {
    await io();
    const module = findSubpage(slug);
    if (!module) return null;
    const [place, data] = await Promise.all([
      getPlace(id, nr),
      module.load(id, nr),
    ]);
    return { module, place, data };
  },
);

/**
 * A subpage's content (subpageData), whole, behind the page's one
 * <Suspense> (components/place-suspense.tsx): a live module's heading and
 * its body (Module.Details, its checked line from the same read as its
 * data), or the waste subpage. `unknown` is what an unknown place or
 * module shows.
 */
export async function ModuleMain({
  id,
  slug,
  nr,
  missing = false,
  unknown,
}: {
  id: string;
  slug: string;
  nr: string | null;
  missing?: boolean;
  /** What an unknown place or module shows. */
  unknown: ReactNode;
}) {
  const loaded = await subpageData(id, slug, nr);
  if (!loaded?.place || (!loaded.module.live && !loaded.data)) {
    return <>{unknown}</>;
  }
  const { module, place, data } = loaded;
  const checkedAt = data ? (module.checkedAt?.(data) ?? null) : null;
  // Its breadcrumbs: the layout's @breadcrumbs slot (components/place-crumbs.tsx).
  return module.live ? (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <SubpageHeading place={place} heading={module.pageTitle} />
        {data !== null && <module.Details data={data} checkedAt={checkedAt} />}
      </div>
    </div>
  ) : (
    <module.Details data={data} missing={missing} checkedAt={checkedAt} />
  );
}
