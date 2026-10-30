import { HubMain } from "@/components/hub";
import { placeMetadata, redirectIfMoved } from "@/components/place-page";
import { placePath } from "@/lib/places";

// The address page, the hub of modules (components/hub.tsx). Rendered on
// first visit, then served from the cache like a static page. Regenerate
// every 10 minutes; a stale copy is served once more while it does, so it
// can be hours old. The relative words („Dziś”, „Jutro”) and hiding what is
// over are the island's (components/upcoming.tsx), from the device's clock;
// the sections' data is the server's, filtered when it rendered (the next
// pickup, cuts not over). That is refreshed by this window and by the water
// cron, which purges every page tagged WATER after every check
// (lib/zuk-cron.ts).
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
