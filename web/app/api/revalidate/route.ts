import { revalidateTag } from "next/cache";
import { DATASET } from "@/lib/schedule";
import { sameSecret } from "@/lib/secret";

// Called after an import: drops every cached database read, so the next
// request per page or query reads the new data once. On Vercel the same tag
// also deletes the CDN copies of the responses that send it as
// Vercel-Cache-Tag (the PDF, the ICS feed, /api/search and
// /api/place-redirects).
//
//   curl -X POST -H "Authorization: Bearer $REVALIDATE_SECRET" \
//     https://conaulicy.pl/api/revalidate
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

export function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || !sameSecret(given, `Bearer ${secret}`)) {
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
