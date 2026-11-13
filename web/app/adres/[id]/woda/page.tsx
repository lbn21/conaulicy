import { subpageRoute } from "@/components/subpage-route";

// The water subpage, /adres/[id]/woda (components/module-page.tsx), in its
// own folder, so its static shell knows its module
// (components/subpage-route.tsx). Prerendered whole for every known place,
// as the address page (../page.tsx); with ?nr=, proxy.ts sends it to
// ../nr/woda/.

export { generateStaticParams } from "../page";

const route = subpageRoute("woda");
export const generateMetadata = route.generateMetadata;
export default route.Page;
