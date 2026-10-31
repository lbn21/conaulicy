import { PlaceCrumbs } from "@/components/place-crumbs";
import {
  PlaceParams,
  SUBPAGE_CRUMBS_SKELETON,
} from "@/components/place-params";

// A module subpage's breadcrumbs (app/adres/[id]/[module]/page.tsx), before
// <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]/[module]">) {
  return (
    <PlaceParams params={params} skeleton={SUBPAGE_CRUMBS_SKELETON}>
      {({ id, module }) => <PlaceCrumbs id={id} nr={null} module={module} />}
    </PlaceParams>
  );
}
