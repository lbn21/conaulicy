import {
  ModuleMain,
  moduleLive,
  moduleMetadata,
} from "@/components/module-page";
import { PlaceNotFound } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { numberParam } from "@/lib/address-routes";
import { houseNumber } from "@/lib/house";

// A module subpage's routes, one body for all of them: a live module's
// (app/adres/[id]/[module]/…) and the waste subpage's own
// (app/adres/[id]/smieci/…, `waste`), each with its /nr/… and /numer
// variants (lib/address-routes.ts). The waste subpage has its own folder so
// that its fallback is its own first screen (task 237); a static segment
// wins over [module]
// (nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes).

type SubpageParams = Promise<{ id: string; module?: string; nr?: string[] }>;

type Variant = {
  /** The waste subpage's route, whose params hold no module. */
  waste?: boolean;
  /** /numer: ?nr= was sent without a usable number. */
  missing?: boolean;
};

/** The place, module and house number (as given) the params name. */
async function subpageOf(params: SubpageParams, { waste, missing }: Variant) {
  const { id, module = waste ? "smieci" : "", nr } = await params;
  const given = nr ? numberParam(nr) : null;
  return {
    id,
    slug: module,
    nr: given,
    missing:
      Boolean(missing) || (given !== null && houseNumber(given) === null),
  };
}

/** A subpage route's generateMetadata. */
export async function subpageMetadata(
  params: SubpageParams,
  variant: Variant = {},
) {
  const { id, slug, nr, missing } = await subpageOf(params, variant);
  return moduleMetadata(id, slug, nr, missing);
}

/** A subpage route's page: its params behind PlaceSuspense, as above. */
export function SubpageRoute({
  params,
  ...variant
}: Variant & { params: SubpageParams }) {
  return (
    <PlaceSuspense shape={variant.waste ? "waste" : "live"}>
      <SubpageContent params={params} {...variant} />
    </PlaceSuspense>
  );
}

async function SubpageContent({
  params,
  ...variant
}: Variant & { params: SubpageParams }) {
  const { id, slug, nr, missing } = await subpageOf(params, variant);
  return (
    <ModuleMain
      id={id}
      slug={slug}
      nr={nr}
      missing={missing}
      unknown={<PlaceNotFound />}
      live={variant.waste ? null : moduleLive(id, slug, nr)}
    />
  );
}
