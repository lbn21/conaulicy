import {
  ModuleMain,
  moduleLive,
  moduleMetadata,
} from "@/components/module-page";
import { PlaceNotFound } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { SUBPAGE_IDS } from "@/lib/address-routes";
import { allPlaces } from "@/lib/prerender";

// A module's subpage (components/module-page.tsx), cached like the street
// page; proxy.ts redirects a renamed place's old id. The folders nr, numer,
// harmonogram.pdf and woda.ics win over this one, so no module is called that
// (lib/address-routes.ts).
// A static shell, a live module's body in its own hole, as the address page
// (../page.tsx).

// Every known place's every subpage (lib/prerender.ts).
export async function generateStaticParams(): Promise<
  Array<{ id: string; module: string }>
> {
  const places = await allPlaces();
  return places.flatMap(({ id }) =>
    SUBPAGE_IDS.map((module) => ({ id, module })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  const { id, module } = await params;
  return moduleMetadata(id, module, null);
}

export default function ModulePage({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  return (
    <PlaceSuspense>
      <ModulePageContent params={params} />
    </PlaceSuspense>
  );
}

async function ModulePageContent({
  params,
}: Pick<PageProps<"/adres/[id]/[module]">, "params">) {
  const { id, module } = await params;
  return (
    <ModuleMain
      id={id}
      slug={module}
      nr={null}
      unknown={<PlaceNotFound />}
      live={moduleLive(id, module, null)}
    />
  );
}
