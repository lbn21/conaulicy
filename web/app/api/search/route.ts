import type { NextRequest } from "next/server";
import { datasetHeaders } from "@/lib/gate";
import { search } from "@/lib/schedule";
import { MAX_QUERY_LENGTH } from "@/lib/search";

// No rate limit (no Vercel WAF rule). The CDN caches each q (proxy.ts
// redirects unknown parameters away, so they cannot bust it), and the data
// cache in lib/schedule.ts absorbs the rest. Tagged DATASET, so an import's
// POST /api/revalidate deletes the CDN copies too.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json(await search(q.slice(0, MAX_QUERY_LENGTH)), {
    headers: datasetHeaders(),
  });
}
