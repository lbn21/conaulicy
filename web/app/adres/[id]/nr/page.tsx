import { hubRoute } from "@/components/hub-route";

// The address page with ?nr= or ?imgw= (components/hub-route.tsx): proxy.ts
// sends /adres/<id>?nr=… here (lib/address-routes.ts queryRoute) and answers
// this path itself with a 404. The query is read per request behind the
// address pages' skeleton (components/place-suspense.tsx); the place's
// shell for every known place, as ../page.tsx.

export { generateStaticParams } from "../page";

const route = hubRoute(true);
export const generateMetadata = route.generateMetadata;
export default route.Page;
