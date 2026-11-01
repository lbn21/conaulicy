import { CrumbsRoute } from "@/components/place-crumbs";

// The address page's breadcrumbs with a house number
// (app/adres/[id]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/nr/[...nr]">) {
  return <CrumbsRoute params={params} />;
}
