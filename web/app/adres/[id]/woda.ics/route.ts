import { calendarResponse } from "@/lib/ics";
import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { placePath } from "@/lib/places";
import { placeParams } from "@/lib/schedule";
import { waterCalendar, waterFilename } from "@/lib/water-ics";
import { loadWater } from "@/lib/water-load";

// The water cuts at an address as a calendar file (lib/water-ics.ts), from
// the /woda page's own loader, prerendered for every place and re-rendered
// with the water's and the dataset's tags, as /woda. An address with no
// cut to add gets an empty calendar, as a waste zone with no dates does
// (app/ics/[zoneId]); any other id is the prerendered 404 (dynamicParams =
// false). Vercel's own cache headers apply: none of ours.

export const dynamic = "error";
export const dynamicParams = false;
export const generateStaticParams = placeParams;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/adres/[id]/woda.ics">,
) {
  const { id } = await ctx.params;
  const read = await pageData(
    `${placePath(id)}/woda.ics`,
    [SOURCE_TAGS.dataset, SOURCE_TAGS.water],
    async () => ({ now: Date.now(), data: await loadWater(id) }),
  );
  if (!read.data) return new Response(null, { status: 404 });
  return calendarResponse(
    waterCalendar(read.data, new Date(read.now)),
    waterFilename(read.data),
  );
}
