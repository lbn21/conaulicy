import { PlaceMain, placeMetadata } from "@/components/place-page";

// /adres/[id]?nr=7/22 lands here (next.config.ts rewrites it), so a street
// page with a house number is cached like the plain one. The number may
// hold a slash, hence the catch-all.
export const revalidate = 600;

export function generateStaticParams(): Array<{ id: string; nr: string[] }> {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  const { id, nr } = await params;
  return placeMetadata(id, nr.join("/"));
}

export default async function PlaceWithNumberPage({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  const { id, nr } = await params;
  return <PlaceMain id={id} nr={nr.join("/")} />;
}
