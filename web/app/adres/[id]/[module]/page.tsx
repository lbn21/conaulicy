import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";
import { MODULE_ROUTE_IDS } from "@/lib/address-routes";
import { allPlaces } from "@/lib/prerender";

// A module's subpage (components/module-page.tsx), cached like the street
// page; proxy.ts redirects a renamed place's old id. The folders nr, numer,
// harmonogram.pdf and woda.ics win over this one, so no module is called that
// (lib/address-routes.ts).
// A static shell, a live module's body in its own hole, as the address page
// (../page.tsx). The waste subpage has its own folder (../smieci, task 237).

// Every known place's every such subpage (lib/prerender.ts).
export async function generateStaticParams(): Promise<
  Array<{ id: string; module: string }>
> {
  const places = await allPlaces();
  return places.flatMap(({ id }) =>
    MODULE_ROUTE_IDS.map((module) => ({ id, module })),
  );
}

export function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  return subpageMetadata(params);
}

export default function ModulePage({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  return <SubpageRoute params={params} />;
}
