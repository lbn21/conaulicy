import { datasetHeaders } from "@/lib/gate";
import { TEXT_PLAIN } from "@/lib/headers";
import { calendarResponse } from "@/lib/ics";
import { NOINDEX } from "@/lib/indexing";
import { movedTarget } from "@/lib/schedule";
import { waterCalendar, waterFilename } from "@/lib/water-ics";
import { loadWater } from "@/lib/water-load";

// The water cuts at an address as a calendar file (lib/water-ics.ts), from
// the /woda page's own loader. An address with no cut to add gets an empty
// calendar, as a waste zone with no dates does (app/ics/[zoneId]); an
// unknown one a 404, a renamed one its new address.

// A redirect or a 404: an hour at the CDN, without stale-while-revalidate.
const NO_STALE = "public, s-maxage=3600";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const data = await loadWater(id, url.searchParams.get("nr"));
  const moved = data ? null : await movedTarget(id, url.pathname + url.search);
  if (moved) {
    return new Response(null, {
      status: 308,
      headers: { Location: moved, ...datasetHeaders(NO_STALE) },
    });
  }
  if (!data) {
    return new Response("Nie znamy takiego adresu.", {
      status: 404,
      headers: { ...TEXT_PLAIN, ...datasetHeaders(NO_STALE), ...NOINDEX },
    });
  }
  return calendarResponse(
    waterCalendar(data, new Date()),
    waterFilename(data),
    {
      ...datasetHeaders(),
      ...NOINDEX,
    },
  );
}
