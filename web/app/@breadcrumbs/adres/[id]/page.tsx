import { PlaceCrumbs } from "@/components/place-crumbs";

// The address page's breadcrumbs (app/adres/[id]/page.tsx), before <main>.
export const ensureStatic = "prefetch";

export { generateStaticParams } from "@/app/adres/[id]/page";

export default async function Crumbs({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  return <PlaceCrumbs id={id} nr={null} />;
}
