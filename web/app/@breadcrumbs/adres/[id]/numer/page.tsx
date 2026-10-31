import { PlaceCrumbs } from "@/components/place-crumbs";

// /numer's breadcrumbs (app/adres/[id]/numer/page.tsx), before <main>.
export const ensureStatic = "prefetch";

export { generateStaticParams } from "@/app/adres/[id]/page";

export default async function Crumbs({
  params,
}: PageProps<"/adres/[id]/numer">) {
  const { id } = await params;
  return <PlaceCrumbs id={id} nr={null} />;
}
