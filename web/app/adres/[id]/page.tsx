import { HubMain } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { allPlaces } from "@/lib/prerender";

// The address page, the hub of modules (components/hub.tsx): its static
// shell holds only the skeleton (components/place-suspense.tsx); the whole
// page is read per request behind it, every block at once, and comes in
// together (task 239). Its prefetch stays static (the root layout's
// ensureStatic).

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
    <PlaceSuspense>
      <PlacePageContent params={params} />
    </PlaceSuspense>
  );
}

async function PlacePageContent({
  params,
}: Pick<PageProps<"/adres/[id]">, "params">) {
  // A renamed place's old address: proxy.ts answers its 308.
  const { id } = await params;
  return <HubMain id={id} nr={null} unknown={<PlaceNotFound />} />;
}
