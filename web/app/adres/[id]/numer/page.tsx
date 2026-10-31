import { HubMain, hubLive } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";

// /adres/[id]?nr= with no usable house number (empty, or not a number) lands
// here (proxy.ts rewrites it). A split street answers with the street page
// and GOV.UK's error summary; any other place shows its address page. Its own cached path,
// so this page is never served for a real number, which has /nr/….
// A static shell with live holes, prerendered for every place, as the
// address page (../page.tsx).

export { generateStaticParams } from "../page";

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/numer">) {
  const { id } = await params;
  return placeMetadata(id, null, true);
}

export default async function PlaceMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/numer">) {
  const { id } = await params;
  return (
    <HubMain
      id={id}
      nr={null}
      missing
      unknown={<PlaceNotFound />}
      {...hubLive(id, null)}
    />
  );
}
