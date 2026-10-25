import { HubMain } from "@/components/hub";
import { placeMetadata, redirectIfMoved } from "@/components/place-page";
import { placePath } from "@/lib/places";

// The address page, the hub of modules (components/hub.tsx). Rendered on
// first visit, then served from the cache like a static page. Regenerate
// every 10 minutes, so the static HTML drops past pickups and ended IMGW
// warnings; its dates are absolute, so a copy cached over midnight stays
// true.
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
  await redirectIfMoved(id, placePath(id));
  return <HubMain id={id} nr={null} />;
}
