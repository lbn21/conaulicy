import { longDate } from "./date-labels.ts";
import { addDays, WARSAW } from "./dates.ts";
import { hasSource } from "./event-source.ts";
import {
  calendarBody,
  calendarHead,
  escapeText,
  icsDate,
  icsUtc,
} from "./ics.ts";
import { fileSlug } from "./normalize.ts";
import {
  DISCLAIMER,
  disclaimer,
  laterNote,
  putOutNote,
} from "./schedule-notes.ts";

// The waste calendar (app/ics/[zoneId]): its names, the one the calendar
// app shows and the file's, both from the zone's own name, never its id;
// and its body. Pure, so the unit tests read the file.

/** "Wywóz śmieci – Gmina Lubaczów, sektor 1". */
export function wasteCalendarName(zoneName: string): string {
  return `Wywóz śmieci – ${zoneName}`;
}

/** "wywoz-smieci-gmina-lubaczow-sektor-1.ics". */
export function wasteFilename(zoneName: string): string {
  return `${fileSlug(wasteCalendarName(zoneName))}.ics`;
}

/** What the file needs of lib/schedule.ts getZone's zone. */
type WasteZone = {
  name: string;
  gmina: string | null;
  events: {
    id: string;
    start: string;
    label: string;
    sourceUrl: string;
    checkedAt: string;
    payload: Record<string, unknown> | null;
  }[];
};

/**
 * The zone's file: one all-day event per pickup with its source and the day
 * checked (no source, no display; lib/event-source.ts).
 */
export function wasteCalendar(zone: WasteZone, now: Date): string {
  const stamp = icsUtc(now);
  const shown = zone.events.filter(hasSource);
  // The next year's dates, in the calendar's description (no event).
  const later = laterNote(shown.map((event) => ({ date: event.start })));
  const lines = [
    ...calendarHead("Wywoz smieci", wasteCalendarName(zone.name)),
    ...(later ? [`X-WR-CALDESC:${escapeText(later)}`] : []),
    `X-WR-TIMEZONE:${WARSAW}`,
  ];
  const notUs = zone.gmina ? disclaimer(zone.gmina) : DISCLAIMER;

  for (const event of shown) {
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
  return calendarBody(lines);
}
