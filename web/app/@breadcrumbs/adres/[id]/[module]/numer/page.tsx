import { PlaceCrumbs } from "@/components/place-crumbs";

// A module subpage's /numer breadcrumbs
// (app/adres/[id]/[module]/numer/page.tsx), before <main>.
export const ensureStatic = "prefetch";

export { generateStaticParams } from "@/app/adres/[id]/[module]/page";

export default async function Crumbs({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  const { id, module } = await params;
  return <PlaceCrumbs id={id} nr={null} module={module} />;
}
