import { CrumbsRoute } from "@/components/place-crumbs";

// A module subpage's breadcrumbs with a house number
// (app/adres/[id]/[module]/nr/[...nr]/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/[module]/nr/[...nr]/page";

export default function Crumbs({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  return <CrumbsRoute params={params} subpage />;
}
