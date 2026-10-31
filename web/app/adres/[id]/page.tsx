import { HubMain } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { firstAddress } from "@/lib/prerender";

// The address page, the hub of modules (components/hub.tsx). Rendered on
// first visit, then served from the cache like a static page: its body is
// cached (HubMain, the `page` profile, next.config.ts), so it regenerates
// every 10 minutes; a stale copy is served once more while it does, so it
// can be hours old. The relative words („Dziś”, „Jutro”) and hiding what is
// over are the island's (components/upcoming.tsx), from the device's clock;
// the sections' data is the server's, filtered when it rendered (the next
// pickup, cuts not over). That is refreshed by this window and by the water
// cron, which purges every page tagged WATER after every check
// (lib/zuk-cron.ts).

// The complete page is static: an address not prerendered waits for its
// own, as ISR did, so an unknown place is a real 404.
export const ensureStatic = "navigation";

// One address at build (lib/prerender.ts); the rest on first visit.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const { id } = await firstAddress();
  return [{ id }];
}

export async function generateMetadata({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  return placeMetadata(id, null);
}

export default async function PlacePage({ params }: PageProps<"/adres/[id]">) {
  // A renamed place's old address: proxy.ts answers its 308.
  const { id } = await params;
  return <HubMain id={id} nr={null} unknown={<PlaceNotFound />} />;
}
