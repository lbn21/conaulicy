// What the waste module (lib/modules.ts) says about a place on the address
// page, from today's street page data (PlaceView, unchanged). Pure, so the
// unit tests need no database.
import type { PlaceView } from "@/lib/schedule";
import { absoluteDay } from "./dates.ts";
import type { Checked, Part, SummaryRow } from "./hub.ts";
import { placePath, scheduleName } from "./places.ts";
import {
  hasUpcoming,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  putOutBy,
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
    `${why} Do tego czasu sprawdź odbiory w harmonogramie gminy.`,
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

// Dates not checked yet: one short sentence on the card (the subpage keeps
// the full UNVERIFIED_NOTE), linking the gmina's schedule when we know it.
function unverifiedNote(place: PlaceView): Part[] {
  const href = place.schedulePage ?? place.sources.find((s) => s.url)?.url;
  const schedule = "harmonogramie gminy";
  return [
    "Daty odczytaliśmy automatycznie, sprawdź je w ",
    href ? { href, text: schedule } : schedule,
    ".",
  ];
}

/**
 * The waste card, always there: the next pickup, its bins and when to put
 * them out; on a split street without a number, the question's page; or
 * why there are no dates.
 */
export function wasteSummary(place: PlaceView): SummaryRow[] {
  const key = "Najbliższy odbiór";
  if (place.askNumber) {
    return [
      [
        key,
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
        key,
        noDates(
          place,
          `${noDataHeading(place.kind)}. Harmonogramu tu nie zgadujemy.`,
        ),
      ],
    ];
  }
  if (!hasUpcoming(place.days, place.today)) {
    return [[key, noDates(place, `${NO_MORE_DATES}. ${NO_MORE_DATES_NEXT}`)]];
  }
  const next = place.days.find((day) => day.date >= place.today);
  if (!next) return [];
  const rows: SummaryRow[] = [
    [key, [absoluteDay(next.date)]],
    ["Pojemniki", [{ bins: next.pickups }]],
  ];
  const time = next.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
  if (time) rows.push(["Wystaw", [putOutBy(time)]]);
  if (!place.verified) rows.push(["Uwaga", unverifiedNote(place)]);
  return rows;
}

/** One „Źródło” row per source: its link and its part. */
export function wasteSources(place: PlaceView): Part[][] {
  const name = scheduleName(place.gmina);
  return place.sources.map((source) => [
    source.url ? { href: source.url, text: name } : name,
    `, ${source.label}`,
  ]);
}

/**
 * The day we last compared the place's sources with the originals
 * (events.checkedAt), the oldest of several: „Ostatnio sprawdziliśmy …”.
 */
export function wasteChecked(place: PlaceView): Checked {
  const days = place.sources.flatMap((s) => (s.checkedAt ? [s.checkedAt] : []));
  return days.toSorted()[0] ?? null;
}
