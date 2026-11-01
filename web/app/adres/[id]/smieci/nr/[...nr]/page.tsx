import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";
import { firstAddress } from "@/lib/prerender";

// /adres/[id]/smieci?nr=7/22 lands here (next.config.ts rewrites it), as
// /adres/[id]/[module]/nr/… for a live module's subpage; one number
// prerendered (lib/prerender.ts firstAddress).

export async function generateStaticParams(): Promise<
  Array<{ id: string; nr: string[] }>
> {
  return [await firstAddress()];
}

export function generateMetadata({
  params,
}: PageProps<"/adres/[id]/smieci/nr/[...nr]">) {
  return subpageMetadata(params, { waste: true });
}

export default function WasteWithNumberPage({
  params,
}: PageProps<"/adres/[id]/smieci/nr/[...nr]">) {
  return <SubpageRoute params={params} waste />;
}
