import { hubData } from "@/components/hub";
import { LiveBlock } from "@/components/live-block";
import { subpageData } from "@/components/module-page";
import { PlaceBreadcrumbs } from "@/components/place-page";
import { CRUMBS_SKELETON } from "@/components/place-suspense";
import { numberParam } from "@/lib/address-routes";

type CrumbsParams = Promise<{ id: string; module?: string; nr?: string[] }>;

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
  module,
}: {
  params: CrumbsParams;
  module?: string;
}) {
  return (
    <LiveBlock skeleton={CRUMBS_SKELETON}>
      <PlaceCrumbs params={params} module={module} />
    </LiveBlock>
  );
}

/**
 * The trail, or nothing where the page is a 404: an unknown place, an
 * unknown module, or a module without its data (as HubMain and ModuleMain
 * decide).
 */
async function PlaceCrumbs({
  params,
  module: fixed,
}: {
  params: CrumbsParams;
  module?: string;
}) {
  const { id, module = fixed, nr: given } = await params;
  const nr = given ? numberParam(given) : null;
  if (module === undefined) {
    const [place] = await hubData(id, nr);
    return place && <PlaceBreadcrumbs place={place} />;
  }
  const loaded = await subpageData(id, module, nr);
  if (!loaded?.place || (!loaded.module.live && !loaded.data)) return null;
  return <PlaceBreadcrumbs place={loaded.place} subpage />;
}
