import { SubpageRoute, subpageMetadata } from "@/components/subpage-route";

// The waste subpage, /adres/[id]/smieci (components/module-page.tsx), in its
// own folder, so its fallback is its own first screen, not a live module's
// (components/subpage-route.tsx, task 237). A static shell, whole, cached
// as the address page; every known place, as the address page (../page.tsx).

export { generateStaticParams } from "../page";

export function generateMetadata({ params }: PageProps<"/adres/[id]/smieci">) {
  return subpageMetadata(params, { waste: true });
}

export default function WastePage({ params }: PageProps<"/adres/[id]/smieci">) {
  return <SubpageRoute params={params} waste />;
}
