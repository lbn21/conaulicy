// The water cuts at an address as a calendar file, /adres/<id>/woda.ics
// (app/adres/[id]/woda.ics): the /woda page's own data (lib/water-load.ts),
// so the page and the file never disagree. Only a cut we can put in a
// calendar goes in: planned, with its day and both its hours. A Notice
// (a link, no date) never does. Pure, so the unit tests read the file.
//
// Each cut keeps its UID across downloads: the post, the place and the day.
// The file keeps no item index (lib/zuk.ts), and one counted from the
// cuts left would shift as a day passes; a date change is a new post
// („aktualizacja dat”) anyway. SEQUENCE is the post's last edit in
// minutes, so an edited post updates the event in calendars that honour it.
// The file is a one-off download, so no event is ever sent as cancelled.
// Each event and its alarm link instead to the address's /woda page (with
// ?nr= as given), which always shows the current state. A link-only change
// does not bump SEQUENCE: it is the post's edit, not ours.

import { SITE_URL } from "./config.generated.ts";
import { addDays, WARSAW, warsawToIso } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import { withHouseNumber } from "./house.ts";
import {
  calendarBody,
  calendarHead,
  escapeText,
  icsDate,
  icsUtc,
} from "./ics.ts";
import { fileSlug } from "./normalize.ts";
import { placePath } from "./places.ts";
import { hours, scope, type Water, waterPath } from "./water-module.ts";
import { sourceOf } from "./water-sources.ts";

const SUMMARY = "Przerwa w dostawie wody";

/** A cut with a confirmed day and hours, planned. */
type CalendarCut = Disruption & { start: string; end: string };

/** The cuts at the address that go in the calendar, soonest first. */
export function calendarCuts(data: Water): CalendarCut[] {
  return data.outages.filter(
    (cut): cut is CalendarCut =>
      cut.cause === "planned" && cut.start !== null && cut.end !== null,
  );
}

/**
 * The file's link on /woda, with the house number as given; null when no
 * cut goes in it, so the page shows no button.
 */
export function waterCalendarHref(data: Water): string | null {
  if (calendarCuts(data).length === 0) return null;
  const nr = data.place.givenNr;
  return `${placePath(data.place.id)}/woda.ics${nr ? `?nr=${nr}` : ""}`;
}

/** "2026-10-27 08:00:00" as "20261027T080000", Warsaw time. */
const local = (wall: string) =>
  `${icsDate(wall.slice(0, 10))}T${wall.slice(11, 19).replaceAll(":", "")}`;

/**
 * "zuk-12345-2026-10-27-…" → "12345" (the gmina's, as ever);
 * "mzgkim-678-…" → "mzgkim-678".
 */
function postId(cut: Disruption): string {
  const [, prefix, id] = /^([a-z]+)-(\d+)-/.exec(cut.uid) ?? [];
  if (!id) return "0";
  return prefix === "zuk" ? id : `${prefix}-${id}`;
}

/** Stable across downloads: the post, the place, the day. */
function cutUid(cut: Disruption): string {
  const { localityId, streetId } = cut.place;
  return `woda-${postId(cut)}-${localityId}-${streetId ?? "all"}-${cut.date}@conaulicy.pl`;
}

/** The post's last edit in minutes since 1970: grows with every edit. */
function cutSequence(cut: Disruption): number {
  const at = warsawToIso(cut.updatedAt.replace("T", " "));
  return at ? Math.floor(Date.parse(at) / 60_000) : 0;
}

/** 18:00 in Warsaw the day before the cut, in UTC. */
function alarmAt(cut: Disruption): string {
  const at = warsawToIso(`${addDays(cut.date, -1)} 18:00:00`) as string;
  return icsUtc(new Date(at));
}

// Europe/Warsaw since 1996: CEST from the last Sunday of March, 2:00, to
// the last Sunday of October, 3:00.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${WARSAW}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** The address with the house number as given, split street or not. */
const address = (data: Water) =>
  withHouseNumber(data.place.label, data.place.givenNr);

/** The file for the address: every cut in calendarCuts, none if none. */
export function waterCalendar(data: Water, now: Date): string {
  const stamp = icsUtc(now);
  const location = address(data);
  const lines = [
    ...calendarHead(SUMMARY, `Przerwy w dostawie wody – ${location}`),
    `X-WR-TIMEZONE:${WARSAW}`,
    ...VTIMEZONE,
  ];
  const check = `Sprawdź, czy przerwa jest aktualna: ${SITE_URL}${waterPath(data.place)}`;
  for (const cut of calendarCuts(data)) {
    const description = [
      `${capitalised(scope(cut))}.`,
      `Źródło: ${cut.source.url}`,
      `Daty i godziny odczytaliśmy z komunikatu ${sourceOf(cut.uid).of}. Gdyby coś się nie zgadzało, rację ma komunikat.`,
      check,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${cutUid(cut)}`,
      `SEQUENCE:${cutSequence(cut)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${WARSAW}:${local(cut.start)}`,
      `DTEND;TZID=${WARSAW}:${local(cut.end)}`,
      `SUMMARY:${escapeText(SUMMARY)}`,
      `LOCATION:${escapeText(location)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${cut.source.url}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Jutro przerwa w dostawie wody, ${hours(cut)}.\n${check}`)}`,
      `TRIGGER;VALUE=DATE-TIME:${alarmAt(cut)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  return calendarBody(lines);
}

/** "woda-ul-zuki-12-lubaczow.ics". */
export function waterFilename(data: Water): string {
  return `${fileSlug(`woda ${address(data)}`)}.ics`;
}
