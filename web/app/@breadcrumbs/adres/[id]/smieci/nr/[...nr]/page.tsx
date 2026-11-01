import { CrumbsRoute } from "@/components/place-crumbs";

// The waste subpage's breadcrumbs with a house number
// (app/adres/[id]/smieci/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/smieci/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/smieci/nr/[...nr]">) {
  return <CrumbsRoute params={params} module="smieci" />;
}
