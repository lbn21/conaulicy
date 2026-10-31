import { connection } from "next/server";
import { datasetHeaders } from "@/lib/gate";
import { movedPlaces } from "@/lib/schedule";

// Renamed places, old id → new id (place_redirects), for proxy.ts: an
// address with ?nr= is rewritten to another page, and a redirect from there
// would carry two Location headers (Next.js replays the render's headers),
// so the proxy answers those 308s itself, before the rewrite. Tiny and
// cached by the CDN; tagged DATASET, so an import's revalidate purges it.
// Answered per request, as before Cache Components: it reads nothing of the
// request, and would otherwise be prerendered at build, its gate
// (datasetHeaders) with it (nextjs.org/docs/app/api-reference/functions/connection).
export async function GET() {
  await connection();
  return Response.json(await movedPlaces(), {
    headers: datasetHeaders(),
  });
}
