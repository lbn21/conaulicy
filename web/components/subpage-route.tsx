import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { ModuleMain } from "@/components/module-page";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import {
  type AddressSearch,
  metadataQuery,
  PlaceUnknown,
  unknownMetadata,
} from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { withHouseNumber } from "@/lib/house";
import { indexable } from "@/lib/indexing";
import type { SubpageId } from "@/lib/module-ids";
import { findSubpage } from "@/lib/modules";
import { placePath, titleLabel } from "@/lib/places";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";
import { shownNr } from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";

// A module subpage's routes, one body for all: each subpage has its own
// static folder (app/adres/[id]/smieci/, woda/, prad/: subpageRoute), so
// its static shell knows its module and its skeleton is its own page
// head (components/place-suspense.tsx); a route's App Shell cannot read
// params (nextjs.org/docs/app/guides/adopting-partial-prefetching). Each
// twice, as the address page (components/hub-route.tsx): the place alone,
// prerendered whole, and with ?nr= (app/adres/[id]/nr/<module>/, where
// proxy.ts sends it), read per request. Any other name after the id is a
// 404 in proxy.ts (lib/address-routes.ts unknownAddress).

type SubpageParams = Promise<{ id: string }>;

type Variant = {
  /** The route's module (its folder's name). */
  module: SubpageId;
};

/** The place and module the route names. */
async function subpageOf(params: SubpageParams, { module }: Variant) {
  const { id } = await params;
  return { id, slug: module };
}

/** A subpage route's generateMetadata. */
async function subpageMetadata(
  params: SubpageParams,
  searchParams: AddressSearch | null,
  variant: Variant,
) {
  const { id, slug } = await subpageOf(params, variant);
  // An unknown module or place: its 404 before ?nr= is read (metadataQuery).
  if (!findSubpage(slug)) return NOT_FOUND_METADATA;
  const query = await metadataQuery(id, searchParams);
  if (!query) return unknownMetadata(id);
  return moduleMetadata(id, slug, query.nr, query.missing);
}

/**
 * A subpage's metadata, the same for every module, cached as the page it
 * describes: its own canonical, the title "<h1> – <place>" („Błąd: ”
 * first on the module's error), the module's description of the place;
 * never a search result unless the module says it may be
 * (Module.indexed), its links followed.
 */
async function moduleMetadata(
  id: string,
  slug: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const module = findSubpage(slug);
  const place = module && (await getPlace(id, nr));
  // As placeMetadata: Next.js's own noindex is the only robots tag.
  if (!module || !place) return NOT_FOUND_METADATA;
  const title = `${module.pageTitle} – ${withHouseNumber(titleLabel(place.label), shownNr(place))}`;
  // With a house number, or an empty one, it describes the place itself.
  const whole = nr ? await getPlace(id, null) : place;
  return {
    ...pageMetadata({
      path: `${placePath(id)}/${module.id}`,
      title: module.error?.(place, missing) ? `Błąd: ${title}` : title,
      description: module.description(whole ?? place),
    }),
    ...(!module.indexed?.(place, missing) && {
      robots: { index: false, follow: indexable() },
    }),
  };
}

/** A subpage route's page: its params behind PlaceSuspense, as above. */
function SubpageRoute({
  params,
  searchParams,
  ...variant
}: Variant & { params: SubpageParams; searchParams: AddressSearch | null }) {
  return (
    <PlaceSuspense module={variant.module}>
      <SubpageContent
        params={params}
        searchParams={searchParams}
        {...variant}
      />
    </PlaceSuspense>
  );
}

async function SubpageContent({
  params,
  searchParams,
  ...variant
}: Variant & { params: SubpageParams; searchParams: AddressSearch | null }) {
  const { id, slug } = await subpageOf(params, variant);
  return (
    <ModuleMain
      id={id}
      slug={slug}
      searchParams={searchParams}
      unknown={<PlaceUnknown id={id} />}
    />
  );
}

/**
 * A subpage's route folder, app/adres/[id]/<module>/page.tsx (and, with
 * `query`, app/adres/[id]/nr/<module>/page.tsx): its metadata and page, so
 * each folder is three lines.
 */
export function subpageRoute(
  module: SubpageId,
  { query = false }: { query?: boolean } = {},
) {
  type Props = { params: SubpageParams; searchParams: AddressSearch };
  const search = (props: Props) => (query ? props.searchParams : null);
  return {
    generateMetadata: (props: Props) =>
      subpageMetadata(props.params, search(props), { module }),
    Page: (props: Props) => (
      <SubpageRoute
        params={props.params}
        searchParams={search(props)}
        module={module}
      />
    ),
  };
}
