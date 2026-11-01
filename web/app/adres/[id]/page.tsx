import { HubMain, hubLive } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { allPlaces } from "@/lib/prerender";

// The address page, the hub of modules (components/hub.tsx): a static shell
// cached until the next import or deploy (the frame and the waste section,
// cacheLife "max", purged by the import with the dataset tag), with every
// block that changes between imports in its own <Suspense> hole, read per
// request („Najbliższe dni”, water, weather: hubLive). Its prefetch stays
// static (the root layout's ensureStatic).

// Every known place at build (lib/prerender.ts), so none gets the fallback
// shell.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return allPlaces();
}

export async function generateMetadata({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  return placeMetadata(id, null);
}

export default function PlacePage({ params }: PageProps<"/adres/[id]">) {
  return (
    <PlaceSuspense shape="hub">
      <PlacePageContent params={params} />
    </PlaceSuspense>
  );
}

async function PlacePageContent({
  params,
}: Pick<PageProps<"/adres/[id]">, "params">) {
  // A renamed place's old address: proxy.ts answers its 308.
  const { id } = await params;
  return (
    <HubMain
      id={id}
      nr={null}
      unknown={<PlaceNotFound />}
      {...hubLive(id, null)}
    />
  );
}
