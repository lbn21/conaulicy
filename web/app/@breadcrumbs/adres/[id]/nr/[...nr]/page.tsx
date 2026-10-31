import { PlaceCrumbs } from "@/components/place-crumbs";
import { HUB_CRUMBS_SKELETON, PlaceParams } from "@/components/place-params";
import { numberParam } from "@/lib/address-routes";

// The address page's breadcrumbs with a house number
// (app/adres/[id]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  return (
    <PlaceParams params={params} skeleton={HUB_CRUMBS_SKELETON}>
      {({ id, nr }) => <PlaceCrumbs id={id} nr={numberParam(nr)} />}
    </PlaceParams>
  );
}
