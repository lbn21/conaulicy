import { ModuleMain, moduleMetadata } from "@/components/module-page";
import { redirectIfMoved } from "@/components/place-page";
import { findModule } from "@/lib/modules";
import { placePath } from "@/lib/places";

// A module's subpage (components/module-page.tsx), cached like the street
// page. The folders nr, numer and harmonogram.pdf win over this one, so no
// module is called that (lib/address-routes.ts).
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
  if (findModule(module)) {
    await redirectIfMoved(id, `${placePath(id)}/${module}`);
  }
  return <ModuleMain id={id} slug={module} nr={null} />;
}
