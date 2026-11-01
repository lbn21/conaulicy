import { CrumbsRoute } from "@/components/place-crumbs";

// A module subpage's breadcrumbs (app/adres/[id]/[module]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]/[module]">) {
  return <CrumbsRoute params={params} subpage />;
}
