import { connection } from "next/server";
import type { PlacesMap } from "@/lib/address-routes";
import { datasetHeaders } from "@/lib/gate";
import { movedPlaces, placeIds } from "@/lib/schedule";

// For proxy.ts, before any address page renders: every place's id (an
// unknown one answers 404: lib/address-routes.ts unknownAddress) and the
// renamed places, old id → new id (place_redirects; an address with ?nr= is
// rewritten to another page, and a redirect from there would carry two
// Location headers, as Next.js replays the render's headers, so the proxy
// answers those 308s itself). Small and cached by the CDN; tagged DATASET,
// so an import's revalidate purges it.
// Answered per request, as before Cache Components: it reads nothing of the
// request, and would otherwise be prerendered at build, its gate
// (datasetHeaders) with it (nextjs.org/docs/app/api-reference/functions/connection).
export async function GET() {
  await connection();
  const [ids, moved] = await Promise.all([placeIds(), movedPlaces()]);
  return Response.json({ ids, moved } satisfies PlacesMap, {
    headers: datasetHeaders(),
  });
}
