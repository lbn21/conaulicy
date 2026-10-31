import { longDate } from "@/lib/date-labels";
import { addDays, WARSAW } from "@/lib/dates";
import { datasetHeaders } from "@/lib/gate";
import { TEXT_PLAIN } from "@/lib/headers";
import {
  calendarBody,
  calendarHead,
  calendarResponse,
  escapeText,
  icsDate,
  icsUtc,
} from "@/lib/ics";
import { NOINDEX } from "@/lib/indexing";
import { getZone } from "@/lib/schedule";
import {
  DISCLAIMER,
  disclaimer,
  laterNote,
  putOutNote,
} from "@/lib/schedule-notes";
import { wasteCalendarName, wasteFilename } from "@/lib/waste-ics";

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

  const stamp = icsUtc(new Date());
  // The next year's dates, in the calendar's description (no event).
  const later = laterNote(zone.events.map((event) => ({ date: event.start })));
  const lines = [
    ...calendarHead("Wywoz smieci", wasteCalendarName(zone.name)),
    ...(later ? [`X-WR-CALDESC:${escapeText(later)}`] : []),
    `X-WR-TIMEZONE:${WARSAW}`,
  ];
  const notUs = zone.gmina ? disclaimer(zone.gmina) : DISCLAIMER;

  for (const event of zone.events) {
    const putOutBy = event.payload?.putOutBy;
    const description = [
      typeof putOutBy === "string" ? putOutNote(putOutBy) : null,
      `Źródło: ${event.sourceUrl} (stan na ${longDate(event.checkedAt)})`,
      notUs,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@conaulicy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(event.start, 1))}`,
      `SUMMARY:${escapeText(`Odbiór: ${event.label}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  return calendarResponse(calendarBody(lines), wasteFilename(zone.name), {
    ...datasetHeaders(),
    ...NOINDEX,
  });
}
