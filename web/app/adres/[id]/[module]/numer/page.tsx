import { ModuleRoute, moduleMetadata } from "@/components/module-page";

// /adres/[id]/[module]?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page.
// A static shell with a live hole, prerendered for every place, as the
// subpage.

export { generateStaticParams } from "../page";

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  const { id, module } = await params;
  return moduleMetadata(id, module, null, true);
}

export default function ModuleMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  return <ModuleRoute params={params} missing />;
}
