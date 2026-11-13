import { subpageRoute } from "@/components/subpage-route";

// The waste subpage with ?nr= (components/subpage-route.tsx): proxy.ts sends
// /adres/<id>/smieci?nr=… here (lib/address-routes.ts queryRoute) and answers
// this path itself with a 404. Read per request behind the address pages'
// skeleton (components/place-suspense.tsx); every known place, as
// ../../page.tsx.

export { generateStaticParams } from "../../page";

const route = subpageRoute("smieci", { query: true });
export const generateMetadata = route.generateMetadata;
export default route.Page;
