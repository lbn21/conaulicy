import { CrumbsSuspense, PlaceCrumbs } from "@/components/place-crumbs";

// A module subpage's breadcrumbs (app/adres/[id]/[module]/page.tsx), before
// <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]/[module]">) {
  return (
    <CrumbsSuspense>
      <CrumbsContent params={params} />
    </CrumbsSuspense>
  );
}

async function CrumbsContent({
  params,
}: Pick<PageProps<"/adres/[id]/[module]">, "params">) {
  const { id, module } = await params;
  return <PlaceCrumbs id={id} nr={null} module={module} />;
}
