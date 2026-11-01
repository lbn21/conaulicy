import { Suspense } from "react";
import { PlaceCrumbs } from "@/components/place-crumbs";
import { numberParam } from "@/lib/address-routes";

// The address page's breadcrumbs with a house number
// (app/adres/[id]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  return (
    <Suspense>
      <CrumbsContent params={params} />
    </Suspense>
  );
}

async function CrumbsContent({
  params,
}: Pick<PageProps<"/adres/[id]/nr/[...nr]">, "params">) {
  const { id, nr } = await params;
  return <PlaceCrumbs id={id} nr={numberParam(nr)} />;
}
