import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { searchIndex } from "@/lib/schedule";
import { SEARCH_INDEX_PATH } from "@/lib/search";

// The search field's index (lib/schedule.ts searchIndex) at one fixed path,
// prerendered at build and re-rendered with the dataset (its tag), as every
// page; no query string, which could miss the CDN's cache. Vercel's own
// cache headers apply: none of ours.

export const dynamic = "error";

export async function GET() {
  const places = await pageData(
    SEARCH_INDEX_PATH,
    [SOURCE_TAGS.dataset],
    async () => (await searchIndex()).places,
  );
  return Response.json(places);
}
