import { ModuleMain, subpageMetadata } from "@/components/module-page";

// The waste subpage, /adres/[id]/smieci (components/module-page.tsx),
// prerendered whole for every place the address page has; any other id is
// the prerendered 404 (dynamicParams = false).

export { placeParams as generateStaticParams } from "@/lib/schedule";
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/smieci">) {
  return subpageMetadata((await params).id, "smieci");
}

export default async function Page({
  params,
}: PageProps<"/adres/[id]/smieci">) {
  return <ModuleMain id={(await params).id} slug="smieci" />;
}
