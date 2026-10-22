import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { DATASET } from "@/lib/schedule";

// Called after an import: drops every cached database read, so the next
// request per page or query reads the new data once. On Vercel the same tag
// also deletes the CDN copies of the responses that send it as
// Vercel-Cache-Tag (the PDF, the ICS feed and /api/search).
//
//   curl -X POST -H "Authorization: Bearer $REVALIDATE_SECRET" \
//     https://conaulicy.pl/api/revalidate
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  revalidateTag(DATASET, { expire: 0 });
  return Response.json(
    { revalidated: [DATASET] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
