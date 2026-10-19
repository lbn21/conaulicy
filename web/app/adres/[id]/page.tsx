import { PlaceMain, placeMetadata } from "@/components/place-page";

// Rendered on first visit, then served from the cache like a static page.
// Regenerate every 10 minutes, so the static HTML drops past pickups and its
// server-rendered "dziś"/"jutro" is at most minutes stale after midnight in
// Warsaw. The client corrects the rare stale copy (see PickupSchedule).
export const revalidate = 600;

// No paths at build time; an empty list still makes the route ISR, not dynamic.
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  return placeMetadata(id, null);
}

export default async function PlacePage({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  return <PlaceMain id={id} nr={null} />;
}
