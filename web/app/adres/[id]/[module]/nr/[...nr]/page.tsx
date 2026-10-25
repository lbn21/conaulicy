import { ModuleMain, moduleMetadata } from "@/components/module-page";

// /adres/[id]/[module]?nr=7/22 lands here (next.config.ts rewrites it), as
// /adres/[id]/nr/… for the street page.
export const revalidate = 600;

export function generateStaticParams(): Array<{
  id: string;
  module: string;
  nr: string[];
}> {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  const { id, module, nr } = await params;
  return moduleMetadata(id, module, nr.join("/"));
}

export default async function ModuleWithNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  const { id, module, nr } = await params;
  return <ModuleMain id={id} slug={module} nr={nr.join("/")} />;
}
