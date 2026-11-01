import { CrumbsSuspense, PlaceCrumbs } from "@/components/place-crumbs";
import { numberParam } from "@/lib/address-routes";

// A module subpage's breadcrumbs with a house number
// (app/adres/[id]/[module]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return (
    <CrumbsSuspense>
      <CrumbsContent params={params} />
    </CrumbsSuspense>
  );
}

async function CrumbsContent({
  params,
}: Pick<PageProps<"/adres/[id]/[module]/nr/[...nr]">, "params">) {
  const { id, module, nr } = await params;
  return <PlaceCrumbs id={id} nr={numberParam(nr)} module={module} />;
}
