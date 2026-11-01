import { CrumbsRoute } from "@/components/place-crumbs";

// The address page's breadcrumbs (app/adres/[id]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/page";

export default function Crumbs({ params }: PageProps<"/adres/[id]">) {
  return <CrumbsRoute params={params} />;
}
