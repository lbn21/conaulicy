import { cacheControl } from "@/lib/gate";
import { NO_STORE } from "@/lib/headers";
import { searchIndex } from "@/lib/schedule";

// The search field's index (lib/schedule.ts searchIndex). The URL carries a
// hash of the content, so a version never changes and the CDN keeps it for a
// year; an import makes a new version (the pages link it once
// /api/revalidate has purged the data cache). An old or unknown version is a
// 404, and the field falls back to /api/search.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/search-index/[version]">,
) {
  const { version } = await ctx.params;
  const index = await searchIndex();
  if (version !== index.version) {
    return Response.json([], {
      status: 404,
      headers: NO_STORE,
    });
  }
  return Response.json(index.places, {
    headers: {
      "Cache-Control": cacheControl(
        "public, max-age=31536000, s-maxage=31536000, immutable",
      ),
    },
  });
}
