import type { NextRequest } from "next/server";
import { search } from "@/lib/schedule";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json(search(q.slice(0, 100)));
}
