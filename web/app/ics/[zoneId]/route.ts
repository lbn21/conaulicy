import { calendarResponse } from "@/lib/ics";
import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { getZone, zoneParams } from "@/lib/schedule";
import { wasteCalendar, wasteFilename } from "@/lib/waste-ics";

// A waste zone's calendar, prerendered for every zone at build and
// re-rendered with the dataset; any other zone is the prerendered 404
// (dynamicParams = false). Vercel's own cache headers apply: none of ours.

export const dynamic = "error";
export const dynamicParams = false;
export const generateStaticParams = zoneParams;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/ics/[zoneId]">,
) {
  const { zoneId } = await ctx.params;
  const id = decodeURIComponent(zoneId);
  const read = await pageData(
    `/ics/${zoneId}`,
    [SOURCE_TAGS.dataset],
    async () => ({
      now: Date.now(),
      zone: await getZone(id),
    }),
  );
  if (!read.zone) return new Response(null, { status: 404 });
  return calendarResponse(
    wasteCalendar(read.zone, new Date(read.now)),
    wasteFilename(read.zone.name),
  );
}
