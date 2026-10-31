import { ModuleRoute, moduleMetadata } from "@/components/module-page";
import { numberParam, SUBPAGE_IDS } from "@/lib/address-routes";
import { houseNumber } from "@/lib/house";
import { firstAddress } from "@/lib/prerender";

// /adres/[id]/[module]?nr=7/22 lands here (next.config.ts rewrites it), as
// /adres/[id]/nr/… for the street page, any other non-empty ?nr= too.
// A static shell with a live hole, as the subpage; one number prerendered
// (lib/prerender.ts firstAddress), as /adres/[id]/nr/….

export async function generateStaticParams(): Promise<
  Array<{ id: string; module: string; nr: string[] }>
> {
  return [{ ...(await firstAddress()), module: SUBPAGE_IDS[0] }];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  const { id, module, nr } = await params;
  const given = numberParam(nr);
  return moduleMetadata(id, module, given, houseNumber(given) === null);
}

export default function ModuleWithNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return <ModuleRoute params={params} />;
}
