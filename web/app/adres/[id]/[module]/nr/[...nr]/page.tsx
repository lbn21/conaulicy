import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";
import { MODULE_ROUTE_IDS } from "@/lib/address-routes";
import { firstAddress } from "@/lib/prerender";

// /adres/[id]/[module]?nr=7/22 lands here (next.config.ts rewrites it), as
// /adres/[id]/nr/… for the street page, any other non-empty ?nr= too.
// A static shell with a live hole, as the subpage; one number prerendered
// (lib/prerender.ts firstAddress), as /adres/[id]/nr/….

export async function generateStaticParams(): Promise<
  Array<{ id: string; module: string; nr: string[] }>
> {
  return [{ ...(await firstAddress()), module: MODULE_ROUTE_IDS[0] }];
}

export function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return subpageMetadata(params);
}

export default function ModuleWithNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return <SubpageRoute params={params} />;
}
