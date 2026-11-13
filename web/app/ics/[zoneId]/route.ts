import { zoneIcsPage } from "@/lib/data-pages";
import { calendarResponse } from "@/lib/ics";
import { pageData } from "@/lib/page-cache";
import { zoneParams } from "@/lib/schedule";
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
  // The param as given at build, or encoded at run time: one path either
  // way (lib/pages.ts zoneIcsPage).
  const { now, view: zone } = await pageData(
    zoneIcsPage(decodeURIComponent(zoneId)),
  );
  if (!zone) return new Response(null, { status: 404 });
  return calendarResponse(
    wasteCalendar(zone, new Date(now)),
    wasteFilename(zone.name),
  );
}
