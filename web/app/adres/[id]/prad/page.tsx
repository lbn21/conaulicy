import { ModuleMain, subpageMetadata } from "@/components/module-page";

// The power subpage, /adres/[id]/prad (components/module-page.tsx),
// prerendered whole for every place the address page has; any other id is
// the prerendered 404 (dynamicParams = false).

export { placeParams as generateStaticParams } from "@/lib/schedule";
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/prad">) {
  return subpageMetadata((await params).id, "prad");
}

export default async function Page({ params }: PageProps<"/adres/[id]/prad">) {
  return <ModuleMain id={(await params).id} slug="prad" />;
}
