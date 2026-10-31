import { PlaceCrumbs } from "@/components/place-crumbs";
import { HUB_CRUMBS_SKELETON, PlaceParams } from "@/components/place-params";

// The address page's breadcrumbs (app/adres/[id]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]">) {
  return (
    <PlaceParams params={params} skeleton={HUB_CRUMBS_SKELETON}>
      {({ id }) => <PlaceCrumbs id={id} nr={null} />}
    </PlaceParams>
  );
}
