import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { ModuleMain } from "@/components/module-page";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import {
  type AddressSearch,
  metadataQuery,
  PlaceNotFound,
} from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { withHouseNumber } from "@/lib/house";
import { indexable } from "@/lib/indexing";
import { findSubpage } from "@/lib/modules";
import { placePath, titleLabel } from "@/lib/places";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";
import { shownNr } from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";

// A module subpage's routes, one body for both: a live module's
// (app/adres/[id]/[module]/) and the waste subpage's own
// (app/adres/[id]/smieci/, `waste`), each with its ?nr= (searchParams).
// The waste subpage has its own folder (a static segment wins
// over [module]:
// nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes).

type SubpageParams = Promise<{ id: string; module?: string }>;

type Variant = {
  /** The waste subpage's route, whose params hold no module. */
  waste?: boolean;
};

/** The place and module the params name. */
async function subpageOf(params: SubpageParams, { waste }: Variant) {
  const { id, module = waste ? "smieci" : "" } = await params;
  return { id, slug: module };
}

/** A subpage route's generateMetadata. */
export async function subpageMetadata(
  params: SubpageParams,
  searchParams: AddressSearch,
  variant: Variant = {},
) {
  const { id, slug } = await subpageOf(params, variant);
  // An unknown module or place: its 404 before ?nr= is read (metadataQuery).
  const query = findSubpage(slug) && (await metadataQuery(id, searchParams));
  if (!query) return NOT_FOUND_METADATA;
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
export function SubpageRoute({
  params,
  searchParams,
  ...variant
}: Variant & { params: SubpageParams; searchParams: AddressSearch }) {
  return (
    <PlaceSuspense>
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
}: Variant & { params: SubpageParams; searchParams: AddressSearch }) {
  const { id, slug } = await subpageOf(params, variant);
  return (
    <ModuleMain
      id={id}
      slug={slug}
      searchParams={searchParams}
      unknown={<PlaceNotFound />}
    />
  );
}
