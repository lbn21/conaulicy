import { searchIndexPage } from "@/lib/data-pages";
import { pageData } from "@/lib/page-cache";

// The search field's index (lib/schedule.ts searchIndex) at one fixed path,
// prerendered at build and re-rendered with the dataset (its tag), as every
// page; no query string, which could miss the CDN's cache. Vercel's own
// cache headers apply: none of ours.

export const dynamic = "error";

export async function GET() {
  const { view } = await pageData(searchIndexPage);
  return Response.json(view);
}
