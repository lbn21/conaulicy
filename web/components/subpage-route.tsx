import { ModuleMain, moduleMetadata } from "@/components/module-page";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import {
  type AddressSearch,
  metadataQuery,
  PlaceNotFound,
} from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { findSubpage } from "@/lib/modules";

// A module subpage's routes, one body for both: a live module's
// (app/adres/[id]/[module]/) and the waste subpage's own
// (app/adres/[id]/smieci/, `waste`), each with its ?nr= (searchParams).
// The waste subpage has its own folder (task 237; a static segment wins
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
