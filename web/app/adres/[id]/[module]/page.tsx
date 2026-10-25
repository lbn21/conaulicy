import { ModuleMain, moduleMetadata } from "@/components/module-page";

// A module's subpage (components/module-page.tsx), cached like the street
// page; proxy.ts redirects a renamed place's old id. The folders nr, numer,
// harmonogram.pdf and woda.ics win over this one, so no module is called that
// (lib/address-routes.ts).
export const revalidate = 600;

export function generateStaticParams(): Array<{ id: string; module: string }> {
  return [];
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
  return <ModuleMain id={id} slug={module} nr={null} />;
}
