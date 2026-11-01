import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";

// /adres/[id]/smieci?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page; prerendered for
// every place, as the subpage.

export { generateStaticParams } from "../page";

export function generateMetadata({
  params,
}: PageProps<"/adres/[id]/smieci/numer">) {
  return subpageMetadata(params, { waste: true, missing: true });
}

export default function WasteMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/smieci/numer">) {
  return <SubpageRoute params={params} waste missing />;
}
