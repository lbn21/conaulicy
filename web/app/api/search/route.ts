import type { NextRequest } from "next/server";
import { cacheControl } from "@/lib/gate";
import { DATASET, search } from "@/lib/schedule";

// Rate limiting lives in the Vercel WAF rule on /api/* (see
// docs/tasks/task-00-kickoff.md); the CDN cache absorbs repeated queries,
// and the data cache in lib/schedule.ts the rest. Tagged DATASET, so an
// import's POST /api/revalidate deletes the CDN copies too.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json(await search(q.slice(0, 100)), {
    headers: {
      "Cache-Control": cacheControl(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      ),
      "Vercel-Cache-Tag": DATASET,
    },
  });
}
