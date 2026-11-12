import { io } from "next/cache";
import { cache, type ReactNode } from "react";
import {
  AddressPage,
  type AddressSearch,
  knownPlace,
  numberQuery,
  placeCaption,
} from "@/components/place-page";
import { WarsawToday } from "@/components/warsaw-today";
import { unchecked } from "@/lib/hub";
import { findSubpage, type Module } from "@/lib/modules";
import { getPlace, type PlaceView } from "@/lib/schedule";

// A module's subpage, /adres/[id]/<module> (lib/modules.ts), with the same
// ?nr= as the address page (components/place-page.tsx numberQuery), under
// the place's breadcrumbs (before <main>): one frame for every module
// (Subpage), its body the module's Details. An unknown module is a 404.
// Its metadata: components/subpage-route.tsx. Read per request, whole, behind one
// <Suspense> with one skeleton, as the address page (components/hub.tsx).

/**
 * Everything a subpage shows, read per request (after io(), so nothing
 * date-dependent is ever prerendered), the place and the
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
 * <Suspense> (components/place-suspense.tsx). `unknown` is what an
 * unknown place or module shows.
 */
export async function ModuleMain({
  id,
  slug,
  searchParams,
  unknown,
}: {
  id: string;
  slug: string;
  /** The page's, for its ?nr= (numberQuery). */
  searchParams: AddressSearch;
  /** What an unknown place or module shows. */
  unknown: ReactNode;
}) {
  // An unknown module or place: its 404 before anything is read per
  // request (components/place-page.tsx knownPlace).
  if (!findSubpage(slug) || !(await knownPlace(id))) return <>{unknown}</>;
  const { nr, missing } = await numberQuery(searchParams);
  const loaded = await subpageData(id, slug, nr);
  if (!loaded?.place) return <>{unknown}</>;
  const { module, place, data } = loaded;
  // Its breadcrumbs: the layout's @breadcrumbs slot (components/place-crumbs.tsx).
  // „Dziś” and „Jutro” for the read's Warsaw day (components/warsaw-today.tsx).
  return (
    <WarsawToday day={place.today}>
      <Subpage module={module} place={place} data={data} missing={missing} />
    </WarsawToday>
  );
}

/**
 * Every module's subpage, one frame (components/place-page.tsx
 * AddressPage): the place as the caption, the module's h1, its error; then
 * its body (Module.Details, its source and check time at the bottom), or, with no data now, the address page's line
 * that it could not be checked (lib/hub.ts unchecked).
 */
export function Subpage({
  module,
  place,
  data,
  missing = false,
}: {
  module: Module<unknown>;
  place: PlaceView;
  data: unknown;
  missing?: boolean;
}) {
  const error = module.error?.(place, missing) ?? null;
  return (
    <AddressPage
      place={place}
      caption={placeCaption(place)}
      heading={module.pageTitle}
      error={error}
      icon={module.id}
    >
      {/* The module's colours for everything in its body (site.scss
        .app-mod--*): its badges, chips and cards. */}
      <div className={`app-mod app-mod--${module.id}`}>
        {data === null ? (
          <p className="app-empty govuk-body">{unchecked(module)}</p>
        ) : (
          <module.Details data={data} error={error} />
        )}
      </div>
    </AddressPage>
  );
}
