import { crumbsRoute } from "@/components/place-crumbs";

// The power subpage's breadcrumbs (app/adres/[id]/prad/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/prad/page";

export default crumbsRoute("prad");
