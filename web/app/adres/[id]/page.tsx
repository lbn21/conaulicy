import { hubRoute } from "@/components/hub-route";
import { allPlaces } from "@/lib/prerender";

// The address page, the hub of modules (components/hub.tsx), the place
// alone: prerendered whole, its data cached as "live" (next.config.ts), so
// a load's HTML is the page, no skeleton. With ?nr= or ?imgw=, proxy.ts
// sends the request to ./nr/ (components/hub-route.tsx). Its prefetch stays
// static (the root layout's ensureStatic).

// Every known place at build (lib/prerender.ts), so none gets the fallback
// shell.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return allPlaces();
}

const route = hubRoute(false);
export const generateMetadata = route.generateMetadata;
export default route.Page;
