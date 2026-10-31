import { ModuleMain, moduleMetadata } from "@/components/module-page";
import { PlaceNotFound } from "@/components/place-page";
import { SUBPAGE_IDS } from "@/lib/address-routes";
import { firstAddress } from "@/lib/prerender";

// A module's subpage (components/module-page.tsx), cached like the street
// page; proxy.ts redirects a renamed place's old id. The folders nr, numer,
// harmonogram.pdf and woda.ics win over this one, so no module is called that
// (lib/address-routes.ts).
// Static and prerendered as the address page (../page.tsx).
export const ensureStatic = "navigation";

// The first address's first subpage (lib/prerender.ts).
export async function generateStaticParams(): Promise<
  Array<{ id: string; module: string }>
> {
  const { id } = await firstAddress();
  return [{ id, module: SUBPAGE_IDS[0] }];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  const { id, module } = await params;
  return moduleMetadata(id, module, null);
}

export default async function ModulePage({
  params,
}: PageProps<"/adres/[id]/[module]">) {
  const { id, module } = await params;
  return (
    <ModuleMain id={id} slug={module} nr={null} unknown={<PlaceNotFound />} />
  );
}
