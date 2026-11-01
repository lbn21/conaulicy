import { Suspense } from "react";
import { PlaceCrumbs } from "@/components/place-crumbs";

// A module subpage's breadcrumbs (app/adres/[id]/[module]/page.tsx), before
// <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]/[module]">) {
  return (
    <Suspense>
      <CrumbsContent params={params} />
    </Suspense>
  );
}

async function CrumbsContent({
  params,
}: Pick<PageProps<"/adres/[id]/[module]">, "params">) {
  const { id, module } = await params;
  return <PlaceCrumbs id={id} nr={null} module={module} />;
}
