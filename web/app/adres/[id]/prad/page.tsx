import { subpageRoute } from "@/components/subpage-route";

// The power subpage, /adres/[id]/prad (components/module-page.tsx), in its
// own folder, so its static shell knows its module
// (components/subpage-route.tsx). Read per request behind the address
// pages' one skeleton (components/place-suspense.tsx); every known place,
// as the address page (../page.tsx).

export { generateStaticParams } from "../page";

const route = subpageRoute("prad");
export const generateMetadata = route.generateMetadata;
export default route.Page;
