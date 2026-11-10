// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat (lib/imgw-shown.ts), with a notice when the copy
// is old. The timeline has each warning (when, its level); /pogoda
// (components/weather-page.tsx) adds IMGW's own description of each, its
// probability, and IMGW's page. Pure, so the unit tests read every state.
import { warsawDay } from "./date-labels.ts";
import { type Group, type Part, span } from "./hub.ts";
import {
  CURRENT,
  IMGW_PAGE,
  type ImgwRead,
  type Shown,
  type ShownWarning,
  shownWarnings,
  UNREADABLE,
} from "./imgw-shown.ts";
import type { Item } from "./upcoming.ts";

export type Weather = {
  /** null: fresh, and no warning in force or to come. */
  shown: Shown | null;
  /** The last good check (ms); null: the store could not be read now. */
  checkedAt: number | null;
};

/** The source, short. */
const SHORT = "IMGW-PIB";

/** Where every warning applies: all our gminas lie in one powiat. */
export const POWIAT = {
  name: "Cały powiat lubaczowski",
  of: "powiatu lubaczowskiego",
};

/**
 * The module's data, or null when there is no copy of the feed yet: then
 * the address page says it has not been checked yet. The store
 * unreadable: the notice, no check time.
 */
export function weather(copy: ImgwRead, now: number): Weather | null {
  if (!copy) return null;
  return {
    shown: shownWarnings(copy, now),
    checkedAt: copy === UNREADABLE ? null : copy.checkedAt,
  };
}

// IMGW's three levels: the tag's colour, never the only signal (its text
// says the level).
export const TAG = {
  1: "govuk-tag govuk-tag--yellow",
  2: "govuk-tag govuk-tag--orange",
  3: "govuk-tag govuk-tag--red",
} as const;

/** „Stopień 2 z 3”. */
export const levelText = (warning: ShownWarning) =>
  `Stopień ${warning.level} z 3`;

/** The timeline's items: one per warning in force or to come, the powiat's. */
export function weatherUpcoming(data: Weather): Item[] {
  return (data.shown?.warnings ?? []).map((warning) => ({
    module: "pogoda",
    span: span(warsawDay(Date.parse(warning.from)), warning.from, warning.to),
    event: warning.event.charAt(0).toLowerCase() + warning.event.slice(1),
    level: { tag: TAG[warning.level], text: levelText(warning) },
    second: `${POWIAT.name}.`,
  }));
}

/** /pogoda's line with no warning in force. */
export const NO_WARNINGS = `Brak ostrzeżeń IMGW dla ${POWIAT.of}.`;

/**
 * The hub's IMGW lines that belong to no day (task 263): the notice when
 * the copy is old or unreadable, its link IMGW's page; else none.
 */
export function weatherNotices(data: Weather): Group[] {
  const notice = data.shown?.notice;
  return notice
    ? [
        [
          [
            `${notice} ${CURRENT.text} `,
            { href: IMGW_PAGE, text: CURRENT.link },
            ".",
          ],
        ],
      ]
    : [];
}

/** „Źródło”: IMGW's page. */
export function weatherSources(): Part[][] {
  return [[{ href: IMGW_PAGE, text: SHORT }]];
}

/** The last good check of IMGW; none when unknown. */
export function weatherChecked(data: Weather): Date | null {
  return data.checkedAt === null ? null : new Date(data.checkedAt);
}
