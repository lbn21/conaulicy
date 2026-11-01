import { Suspense } from "react";
import { PlaceCrumbs } from "@/components/place-crumbs";

// The address page's breadcrumbs (app/adres/[id]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]">) {
  return (
    <Suspense>
      <CrumbsContent params={params} />
    </Suspense>
  );
}

async function CrumbsContent({
  params,
}: Pick<PageProps<"/adres/[id]">, "params">) {
  const { id } = await params;
  return <PlaceCrumbs id={id} nr={null} />;
}
