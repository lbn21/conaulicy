import { datasetHeaders } from "@/lib/gate";
import { TEXT_PLAIN } from "@/lib/headers";
import { calendarResponse } from "@/lib/ics";
import { NOINDEX } from "@/lib/indexing";
import { getZone } from "@/lib/schedule";
import { wasteCalendar, wasteFilename } from "@/lib/waste-ics";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/ics/[zoneId]">,
) {
  const { zoneId } = await ctx.params;
  const zone = await getZone(decodeURIComponent(zoneId));
  if (!zone) {
    return new Response("Nie znamy takiego harmonogramu.", {
      status: 404,
      headers: { ...TEXT_PLAIN, ...NOINDEX },
    });
  }

  return calendarResponse(
    wasteCalendar(zone, new Date()),
    wasteFilename(zone.name),
    { ...datasetHeaders(), ...NOINDEX },
  );
}
