import { HubMain } from "@/components/hub";
import { placeMetadata } from "@/components/place-page";
import { houseNumber } from "@/lib/house";

// /adres/[id]?nr=7/22 lands here (next.config.ts rewrites it), so an
// address page with a house number is cached like the plain one. The number may
// hold a slash, hence the catch-all. Any other non-empty ?nr= lands here too
// (proxy.ts): a value that is no house number at all is, as on /numer, a
// missing one (a split street asks again, never indexed).
export const revalidate = 600;

export function generateStaticParams(): Array<{ id: string; nr: string[] }> {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  const { id, nr } = await params;
  const given = nr.join("/");
  return placeMetadata(id, given, houseNumber(given) === null);
}

export default async function PlaceWithNumberPage({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  const { id, nr } = await params;
  const given = nr.join("/");
  return <HubMain id={id} nr={given} missing={houseNumber(given) === null} />;
}
