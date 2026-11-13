import { subpageRoute } from "@/components/subpage-route";

// The water subpage with ?nr= (components/subpage-route.tsx): proxy.ts sends
// /adres/<id>/woda?nr=… here (lib/address-routes.ts queryRoute) and answers
// this path itself with a 404. Read per request behind the address pages'
// skeleton (components/place-suspense.tsx); every known place, as
// ../../page.tsx.

export { generateStaticParams } from "../../page";

const route = subpageRoute("woda", { query: true });
export const generateMetadata = route.generateMetadata;
export default route.Page;
