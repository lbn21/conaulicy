import { HubMain } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { houseQuery } from "@/lib/house";
import { allPlaces } from "@/lib/prerender";

// The address page, the hub of modules (components/hub.tsx): its static
// shell holds only the skeleton (components/place-suspense.tsx); the whole
// page is read per request behind it, every block at once, and comes in
// together (task 239). A house number is ?nr= (searchParams), read behind
// the skeleton too (components/place-page.tsx numberQuery). Its prefetch
// stays static (the root layout's ensureStatic).

// Every known place at build (lib/prerender.ts), so none gets the fallback
// shell.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return allPlaces();
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/adres/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { nr, missing } = houseQuery(query.nr);
  return placeMetadata(id, nr, missing);
}

export default function PlacePage({
  params,
  searchParams,
}: PageProps<"/adres/[id]">) {
  return (
    <PlaceSuspense>
      <PlacePageContent params={params} searchParams={searchParams} />
    </PlaceSuspense>
  );
}

async function PlacePageContent({
  params,
  searchParams,
}: Pick<PageProps<"/adres/[id]">, "params" | "searchParams">) {
  // A renamed place's old address: proxy.ts answers its 308.
  const { id } = await params;
  return (
    <HubMain id={id} searchParams={searchParams} unknown={<PlaceNotFound />} />
  );
}
