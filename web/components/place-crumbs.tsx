import { hubData, imgwQuery } from "@/components/hub";
import { LiveBlock } from "@/components/live-block";
import { subpageData } from "@/components/module-page";
import {
  type AddressSearch,
  numberQuery,
  PlaceBreadcrumbs,
} from "@/components/place-page";
import { CRUMBS_SKELETON } from "@/components/place-suspense";

type CrumbsParams = Promise<{ id: string; module?: string }>;

/**
 * An address page's @breadcrumbs route (app/@breadcrumbs/adres/[id]/…),
 * one body for all of them, before the layout's one <main> (app/layout.tsx,
 * docs/layout.md): the address page's, or a module subpage's (`module` for
 * the waste subpage's own route, whose params hold no module:
 * components/subpage-route.tsx). Its fallback is the page skeleton's first
 * line (components/place-suspense.tsx), and it reads the page's own data,
 * from the same request-scoped read (hubData, subpageData), so the trail
 * and the page come in together (task 239).
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
  const { id, module = fixed } = await params;
  const { nr } = await numberQuery(searchParams);
  if (module === undefined) {
    const [place] = await hubData(id, nr, await imgwQuery(searchParams));
    return place && <PlaceBreadcrumbs place={place} />;
  }
  const loaded = await subpageData(id, module, nr);
  if (!loaded?.place) return null;
  return <PlaceBreadcrumbs place={loaded.place} subpage />;
}
