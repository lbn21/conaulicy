// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat (lib/imgw-shown.ts), with a notice when the copy
// is old. „Najbliższe dni” lists each warning (when, its level); the
// Pogoda section never lists them again, it gives what the list does not:
// IMGW's own description of each, its probability, and IMGW's page. Pure,
// so the unit tests read every state.
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

/** The block's items: one per warning in force or to come, the powiat's. */
export function weatherUpcoming(data: Weather): Item[] {
  return (data.shown?.warnings ?? []).map((warning) => ({
    module: "pogoda",
    span: span(warsawDay(Date.parse(warning.from)), warning.from, warning.to),
    shownFrom: null,
    event: warning.event.charAt(0).toLowerCase() + warning.event.slice(1),
    level: { tag: TAG[warning.level], text: levelText(warning) },
    second: "Cały powiat.",
    secondUntil: null,
  }));
}

/** The weather's status line with no warning in force. */
export const NO_WARNINGS = "Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.";

/** After the descriptions: IMGW's page, with the map. */
export const IMGW_MORE = "Szczegóły i mapa na meteo.imgw.pl";

/**
 * The section's lines: the notice first when the copy is old (its link
 * IMGW's page); then per warning, which one (its event and level, in
 * words: the tag is the list's) and IMGW's own description with its
 * probability; then IMGW's page. With neither, that there is no warning.
 * No times: „Najbliższe dni” has them.
 */
export function weatherStatus(data: Weather): Group[] {
  if (!data.shown) return [[[NO_WARNINGS]]];
  const { notice, warnings } = data.shown;
  const groups: Group[] = [];
  if (notice)
    groups.push([
      [
        `${notice} ${CURRENT.text} `,
        { href: IMGW_PAGE, text: CURRENT.link },
        ".",
      ],
    ]);
  for (const warning of warnings)
    groups.push([
      [`${warning.event}, ${levelText(warning).toLowerCase()}`],
      [`${warning.text} Prawdopodobieństwo: ${warning.probability}%.`],
    ]);
  if (warnings.length > 0)
    groups.push([[{ href: IMGW_PAGE, text: IMGW_MORE }]]);
  return groups;
}

/** The hub's IMGW lines that belong to no day: the notice, if any. */
export function weatherNotices(data: Weather): Group[] {
  return data.shown?.notice ? weatherStatus(data).slice(0, 1) : [];
}

/** „Źródło”: IMGW's page. */
export function weatherSources(): Part[][] {
  return [[{ href: IMGW_PAGE, text: SHORT }]];
}

/** The last good check of IMGW: „Ostatnio sprawdziliśmy …”; none when unknown. */
export function weatherChecked(data: Weather): Date | null {
  return data.checkedAt === null ? null : new Date(data.checkedAt);
}
