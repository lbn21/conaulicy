// What the waste module (lib/modules.ts) says about a place on the address
// page, from today's street page data (PlaceView, unchanged). Pure, so the
// unit tests need no database, and client-safe: the section's lines are
// drawn on the device (components/waste-status.tsx). Its „Najbliższe dni”
// items are lib/waste-upcoming.ts's.
import type { PickupDay, PlaceView, SourceView } from "@/lib/schedule";
import { absoluteDay, todayInWarsaw } from "./dates.ts";
import type { Checked, Group, Part } from "./hub.ts";
import { placePath, scheduleName, scheduleOwner } from "./places.ts";
import {
  hasUpcoming,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  putOutLine,
  SHORT_UNVERIFIED_NOTE,
} from "./schedule-notes.ts";

/** A place we have no pickup data for: the street page's heading. */
export function noDataHeading(kind: PlaceView["kind"]): string {
  return kind === "ulica"
    ? "Tej ulicy jeszcze nie mamy"
    : "Tej wsi jeszcze nie mamy";
}

/** The street page's words for a split street, before the number. */
const SPLIT_HINT =
  "Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru.";

/** The waste subpage (/adres/<id>/smieci), with the house number. */
export function wastePath(place: Pick<PlaceView, "id" | "nr">): string {
  return `${placePath(place.id)}/smieci${place.nr ? `?nr=${place.nr}` : ""}`;
}

// No dates to show: why, then the gmina's own schedule (linked when we know
// its page), as the street page says it.
function noDates(place: PlaceView, why: string): Part[] {
  return [
    `${why} Do tego czasu sprawdź odbiory w harmonogramie ${scheduleOwner(place.gmina)}.`,
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

/** The section's meta line's note while the dates are not checked yet. */
export function wasteNote(place: PlaceView): string | null {
  return place.verified ? null : SHORT_UNVERIFIED_NOTE;
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
 * „Dziś” or „Za 5 dni” put by the island; the day as of the render),
 * what goes that day („wszystkie pojemniki” when
 * it is every fraction the place has, more than one) and when to put them
 * out; on a split street without a number, the question's page; or why
 * there are no dates.
 */
export function wasteStatus(place: PlaceView): Group[] {
  if (place.askNumber) {
    return [
      [
        [
          `${SPLIT_HINT} `,
          { href: wastePath(place), text: "Podaj numer domu" },
        ],
      ],
    ];
  }
  if (place.zoneId === null) {
    return [
      [
        noDates(
          place,
          `${noDataHeading(place.kind)}. Harmonogramu tu nie zgadujemy.`,
        ),
      ],
    ];
  }
  const next = place.days.find((day) => day.date >= place.today);
  if (!next || !hasUpcoming(place.days, place.today)) {
    return [[noDates(place, `${NO_MORE_DATES}. ${NO_MORE_DATES_NEXT}`)]];
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

/**
 * When an import last saw the place's source files (source_files.lastSeenAt,
 * a time), or, for a source without one, the day we last compared it with
 * the original (events.checkedAt): the oldest of several, a day counting as
 * older than any time on that day. „Ostatnio sprawdziliśmy …”.
 */
export function wasteChecked(place: PlaceView): Checked {
  let oldest: { key: string; at: Date | string } | null = null;
  for (const source of place.sources) {
    const at = source.seenAt ? new Date(source.seenAt) : source.checkedAt;
    if (!at) continue;
    // The Warsaw day first, so a day sorts before that day's times.
    const key =
      typeof at === "string" ? at : `${todayInWarsaw(at)}T${at.toISOString()}`;
    if (!oldest || key < oldest.key) oldest = { key, at };
  }
  return oldest?.at ?? null;
}
