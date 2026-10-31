import { PlaceCrumbs } from "@/components/place-crumbs";
import {
  PlaceParams,
  SUBPAGE_CRUMBS_SKELETON,
} from "@/components/place-params";
import { numberParam } from "@/lib/address-routes";

// A module subpage's breadcrumbs with a house number
// (app/adres/[id]/[module]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return (
    <PlaceParams params={params} skeleton={SUBPAGE_CRUMBS_SKELETON}>
      {({ id, module, nr }) => (
        <PlaceCrumbs id={id} nr={numberParam(nr)} module={module} />
      )}
    </PlaceParams>
  );
}
