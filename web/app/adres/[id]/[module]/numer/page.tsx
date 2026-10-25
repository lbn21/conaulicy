import { ModuleMain, moduleMetadata } from "@/components/module-page";

// /adres/[id]/[module]?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page.
export const revalidate = 600;

export function generateStaticParams(): Array<{ id: string; module: string }> {
  return [];
}

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
  return <ModuleMain id={id} slug={module} nr={null} missing />;
}
