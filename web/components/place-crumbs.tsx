import { hubData, imgwQuery } from "@/components/hub";
import { LiveBlock } from "@/components/live-block";
import { subpageData } from "@/components/module-page";
import {
  type AddressSearch,
  numberQuery,
  PlaceBreadcrumbs,
} from "@/components/place-page";
import { CRUMBS_SKELETON } from "@/components/place-suspense";
import type { SubpageId } from "@/lib/module-ids";

type CrumbsParams = Promise<{ id: string }>;

/**
 * An address page's @breadcrumbs route (app/@breadcrumbs/adres/[id]/…),
 * one body for all of them, before the layout's one <main> (app/layout.tsx,
 * docs/layout.md): the address page's, or a module subpage's (`module`, its
 * route folder's name: components/subpage-route.tsx). Its fallback is the page skeleton's first
 * line (components/place-suspense.tsx), and it reads the page's own data,
 * from the same request-scoped read (hubData, subpageData), so the trail
 * and the page come in together.
 */
export function CrumbsRoute({
  params,
  searchParams,
  module,
}: {
  params: CrumbsParams;
  searchParams: AddressSearch;
  module?: string;
}) {
  return (
    <LiveBlock skeleton={CRUMBS_SKELETON}>
      <PlaceCrumbs
        params={params}
        searchParams={searchParams}
        module={module}
      />
    </LiveBlock>
  );
}

/** A subpage's @breadcrumbs route folder: its page, in one line. */
export function crumbsRoute(module: SubpageId) {
  return ({
    params,
    searchParams,
  }: {
    params: CrumbsParams;
    searchParams: AddressSearch;
  }) => (
    <CrumbsRoute params={params} searchParams={searchParams} module={module} />
  );
}

/**
 * The trail, or nothing where the page is a 404: an unknown place or an
 * unknown module (as HubMain and ModuleMain decide).
 */
async function PlaceCrumbs({
  params,
  searchParams,
  module: fixed,
}: {
  params: CrumbsParams;
  searchParams: AddressSearch;
  module?: string;
}) {
  const { id } = await params;
  const module = fixed;
  const { nr } = await numberQuery(searchParams);
  if (module === undefined) {
    const [place] = await hubData(id, nr, await imgwQuery(searchParams));
    return place && <PlaceBreadcrumbs place={place} />;
  }
  const loaded = await subpageData(id, module, nr);
  if (!loaded?.place) return null;
  return <PlaceBreadcrumbs place={loaded.place} subpage />;
}
