import { HubMain, hubLive } from "@/components/hub";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";
import { numberParam } from "@/lib/address-routes";
import { houseNumber } from "@/lib/house";
import { firstAddress } from "@/lib/prerender";

// /adres/[id]?nr=7/22 lands here (next.config.ts rewrites it), so an
// address page with a house number is cached like the plain one. The number may
// hold a slash, hence the catch-all. Any other non-empty ?nr= lands here too
// (proxy.ts): a value that is no house number at all is, as on /numer, a
// missing one (a split street asks again, never indexed).
// A static shell with live holes, as the address page (../../page.tsx); one
// number prerendered (lib/prerender.ts firstAddress), any other gets the
// route's fallback shell on its first visit.

export async function generateStaticParams(): Promise<
  Array<{ id: string; nr: string[] }>
> {
  return [await firstAddress()];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  const { id, nr } = await params;
  const given = numberParam(nr);
  return placeMetadata(id, given, houseNumber(given) === null);
}

export default function PlaceWithNumberPage({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  return (
    <PlaceSuspense>
      <PlaceWithNumberPageContent params={params} />
    </PlaceSuspense>
  );
}

async function PlaceWithNumberPageContent({
  params,
}: Pick<PageProps<"/adres/[id]/nr/[...nr]">, "params">) {
  const { id, nr } = await params;
  const given = numberParam(nr);
  return (
    <HubMain
      id={id}
      nr={given}
      missing={houseNumber(given) === null}
      unknown={<PlaceNotFound />}
      {...hubLive(id, given)}
    />
  );
}
