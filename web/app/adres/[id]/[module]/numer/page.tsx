import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";

// /adres/[id]/[module]?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page.
// A static shell with a live hole, prerendered for every place, as the
// subpage.

export { generateStaticParams } from "../page";

export function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  return subpageMetadata(params, { missing: true });
}

export default function ModuleMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  return <SubpageRoute params={params} missing />;
}
