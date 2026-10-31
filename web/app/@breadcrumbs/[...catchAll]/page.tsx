import { PlaceCrumbs } from "@/components/place-crumbs";
import { addressPage } from "@/lib/address-routes";

// The breadcrumbs before the layout's <main> (app/layout.tsx), for every
// path but the home page (../page.tsx): the address pages' (the page or a
// module's subpage, plain, /numer or /nr/…, lib/address-routes.ts), nothing
// on the flat pages and a 404. One catch-all, so a client-side navigation
// always replaces what the slot showed: a slot keeps it on a path it does
// not match (nextjs.org/docs/app/api-reference/file-conventions/parallel-routes,
// "Modals": the catch-all slot). Its segments are the page's path.
export default async function Crumbs({
  params,
}: {
  params: Promise<{ catchAll: string[] }>;
}) {
  const page = addressPage((await params).catchAll);
  return page && <PlaceCrumbs {...page} />;
}
