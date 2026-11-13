// What the waste module (lib/modules.ts) says about a place on the address
// page, from today's street page data (PlaceView, unchanged). Pure, so the
// unit tests need no database, and client-safe. Its lines are the address
// page's notices when there are no dates to show (lib/modules.ts); its
// timeline items are lib/waste-upcoming.ts's.
import type { Pickup, PickupDay, PlaceView, SourceView } from "@/lib/schedule";
import { absoluteDay } from "./dates.ts";
import { hasSource } from "./event-source.ts";
import type { Group, Part } from "./hub.ts";
import { placePath, scheduleName, scheduleOwner } from "./places.ts";
import {
  hasUpcoming,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  putOutLine,
} from "./schedule-notes.ts";

/**
 * A place we have no waste schedule for (only the schedule is
 * missing; the place and its other modules are there): the waste
 * subpage's heading, and the address page's notice.
 */
export function noScheduleHeading(kind: PlaceView["kind"]): string {
  return `Nie mamy jeszcze harmonogramu wywozu śmieci dla ${kind === "ulica" ? "tej ulicy" : "tej wsi"}`;
}

/** „Sprawdź odbiory w harmonogramie Urzędu Miejskiego.”, after `lead`. */
export function checkSchedule(
  place: Pick<PlaceView, "gmina">,
  lead = "Sprawdź",
): string {
  return `${lead} odbiory w harmonogramie ${scheduleOwner(place.gmina)}.`;
}

/**
 * The calendar help's first line (components/subpage-parts.tsx
 * CalendarBlock): the schedule's owner, as checkSchedule names it, may
 * change it, and the file does not follow.
 */
export function wasteCalendarRefresh(place: Pick<PlaceView, "gmina">): string {
  return `Jeśli harmonogram ${scheduleOwner(place.gmina)} się zmieni, pobierz plik jeszcze raz.`;
}

/** The waste subpage (/adres/<id>/smieci). */
export function wastePath(place: Pick<PlaceView, "id">): string {
  return `${placePath(place.id)}/smieci`;
}

// No dates to show: why, then the gmina's own schedule (linked when we know
// its page), as the street page says it.
function noDates(place: PlaceView, text: string): Part[] {
  return [
    text,
    ...(place.schedulePage
      ? [
          " ",
          {
            href: place.schedulePage,
            text: `Otwórz ${scheduleName(place.gmina)}`,
          },
        ]
      : []),
  ];
}

/**
 * Whether a day takes every fraction the zone has (all its events, not only
 * the coming ones, so the year's last days are not „wszystkie” for want of
 * dates), more than one.
 */
export const allBins = (place: PlaceView, day: PickupDay) =>
  place.fractions.length > 1 &&
  place.fractions.every((subtype) =>
    day.pickups.some((pickup) => pickup.subtype === subtype),
  );

/**
 * The section's lines, always some: the next pickup's day (absolute, its
 * „Dziś” or „Za 5 dni” put by DayWord; the day as of the render),
 * what goes that day („wszystkie pojemniki” when
 * it is every fraction the place has, more than one) and when to put them
 * out; or why there are no dates.
 */
export function wasteStatus(place: PlaceView): Group[] {
  if (place.zoneId === null) {
    return [
      [
        noDates(
          place,
          `${noScheduleHeading(place.kind)}. ${checkSchedule(place)}`,
        ),
      ],
    ];
  }
  const next = place.days.find((day) => day.date >= place.today);
  if (!next || !hasUpcoming(place.days, place.today)) {
    return [
      [
        noDates(
          place,
          `${NO_MORE_DATES}. ${NO_MORE_DATES_NEXT} ${checkSchedule(place, "Do tego czasu sprawdź")}`,
        ),
      ],
    ];
  }
  const all = allBins(place, next);
  const groups: Group[] = [
    [
      [{ day: next.date, text: absoluteDay(next.date) }],
      [`Tego dnia odbiorą${all ? " wszystkie pojemniki" : ""}:`],
      [{ bins: next.pickups }],
    ],
  ];
  const time = next.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
  if (time) groups.push([[putOutLine(time)]]);
  return groups;
}

/** One „Źródło” per source: its link and its part. */
export function wasteSources(place: PlaceView): Part[][] {
  const name = scheduleName(place.gmina);
  return place.sources.map((source) => [
    source.url ? { href: source.url, text: name } : name,
    `, ${source.label}`,
  ]);
}

/** An upcoming event, as the dataset snapshot holds it (lib/dataset-schema.ts). */
type UpcomingRow = SourceRow & {
  id: string;
  start: string;
  subtype: string;
  label: string;
  shiftedFrom: string | null;
  verified: boolean;
  payload: Record<string, unknown> | null;
};

/**
 * The street page's (and its PDF's) days, sources and verified flag from the
 * zone's upcoming events, in their order. An event without its source or the
 * day checked is left out (no source, no display; lib/event-source.ts).
 */
export function wasteSchedule(
  rows: UpcomingRow[],
): Pick<PlaceView, "days" | "sources" | "verified"> {
  const shown = rows.filter(hasSource);
  const days: PickupDay[] = [];
  for (const event of shown) {
    const pickup: Pickup = {
      id: event.id,
      subtype: event.subtype,
      label: event.label,
      putOutBy:
        typeof event.payload?.putOutBy === "string"
          ? event.payload.putOutBy
          : null,
      shiftedFrom: event.shiftedFrom,
    };
    const last = days.at(-1);
    if (last?.date === event.start) last.pickups.push(pickup);
    else days.push({ date: event.start, pickups: [pickup] });
  }
  return {
    days,
    sources: sourcesOf(shown),
    verified: shown.every((e) => e.verified),
  };
}

/** An upcoming event's source, with its file's source_files.lastSeenAt. */
type SourceRow = {
  sourceDoc: string;
  sourceRef: string | null;
  sourceUrl: string | null;
  checkedAt: string;
  seenAt: string | null;
};

/**
 * One source per document, in the events' order. Its seenAt is the oldest
 * of its files'; null when one of them has no source_files row.
 */
export function sourcesOf(rows: SourceRow[]): SourceView[] {
  const byDoc = new Map<string, SourceView & { unseen: boolean }>();
  for (const row of rows) {
    const known = byDoc.get(row.sourceDoc);
    if (!known) {
      byDoc.set(row.sourceDoc, {
        label: row.sourceRef ?? row.sourceDoc,
        url: row.sourceUrl,
        checkedAt: row.checkedAt,
        seenAt: row.seenAt,
        unseen: !row.seenAt,
      });
    } else if (!row.seenAt) known.unseen = true;
    else if (known.seenAt && Date.parse(row.seenAt) < Date.parse(known.seenAt))
      known.seenAt = row.seenAt;
  }
  return [...byDoc.values()].map(({ unseen, ...source }) => ({
    ...source,
    seenAt: unseen ? null : source.seenAt,
  }));
}
