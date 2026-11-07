import { CrumbsRoute } from "@/components/place-crumbs";

// The waste subpage's breadcrumbs (app/adres/[id]/smieci/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/smieci/page";

export default function Crumbs({
  params,
  searchParams,
}: PageProps<"/adres/[id]/smieci">) {
  return (
    <CrumbsRoute params={params} searchParams={searchParams} module="smieci" />
  );
}
