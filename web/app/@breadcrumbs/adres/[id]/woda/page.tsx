import { crumbsRoute } from "@/components/place-crumbs";

// The water subpage's breadcrumbs (app/adres/[id]/woda/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/woda/page";

export default crumbsRoute("woda");
