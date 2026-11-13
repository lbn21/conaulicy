import { notFound } from "next/navigation";
import { HubMain, hubData } from "@/components/hub";
import { placeMetadata } from "@/components/place-page";
import type { PlaceView } from "@/lib/schedule";

// The address page, the hub of modules (components/hub.tsx), prerendered
// whole for every current place: only these exist; any other id is the
// prerendered 404, answered by Vercel's routing layer with no function
// (dynamicParams = false).

export { placeParams as generateStaticParams } from "@/lib/schedule";
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/adres/[id]">) {
  const read = await hubData((await params).id);
  if (!read) notFound();
  return placeMetadata(read.data[0] as PlaceView);
}

export default async function PlacePage({ params }: PageProps<"/adres/[id]">) {
  return <HubMain id={(await params).id} />;
}
