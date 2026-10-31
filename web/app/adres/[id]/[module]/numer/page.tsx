import { ModuleMain, moduleMetadata } from "@/components/module-page";
import { PlaceNotFound } from "@/components/place-page";

// /adres/[id]/[module]?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page.
// Static and prerendered as the subpage.
export const ensureStatic = "navigation";

export { generateStaticParams } from "../page";

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  const { id, module } = await params;
  return moduleMetadata(id, module, null, true);
}

export default async function ModuleMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  const { id, module } = await params;
  return (
    <ModuleMain
      id={id}
      slug={module}
      nr={null}
      missing
      unknown={<PlaceNotFound />}
    />
  );
}
