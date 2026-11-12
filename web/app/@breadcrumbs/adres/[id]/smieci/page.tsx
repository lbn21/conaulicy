import { crumbsRoute } from "@/components/place-crumbs";

// The waste subpage's breadcrumbs (app/adres/[id]/smieci/page.tsx), before <main>.

export { generateStaticParams } from "@/app/adres/[id]/smieci/page";

export default crumbsRoute("smieci");
