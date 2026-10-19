import type { NextRequest } from "next/server";
import { search } from "@/lib/schedule";

// Rate limiting lives in the Vercel WAF rule on /api/* (see
// docs/tasks/task-00-kickoff.md); the CDN cache absorbs repeated queries.
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json(search(q.slice(0, 100)), {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
