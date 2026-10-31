// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat, filtered as the banner (lib/imgw-banner.ts), from
// the same copy of the feed, with the same notice when it is old. Pure, so
// the unit tests read every state.
import { clockTime, warsawDay } from "./date-labels.ts";
import { absoluteDay } from "./dates.ts";
import { type Group, type Part, span } from "./hub.ts";
import {
  type Banner,
  banner,
  CURRENT,
  IMGW_PAGE,
  type ImgwCopy,
} from "./imgw-banner.ts";
import type { Item } from "./upcoming.ts";

export type Weather = {
  /** null: fresh, and no warning in force or to come. */
  banner: Banner | null;
  /** The last good check (ms). */
  checkedAt: number;
};

/** The source, short. */
const SHORT = "IMGW-PIB";

/**
 * The module's data, or null when there is no copy of the feed yet: then
 * the address page leaves the weather out, as other pages leave out the
 * banner.
 */
export function weather(copy: ImgwCopy | null, now: number): Weather | null {
  if (!copy) return null;
  return { banner: banner(copy, now), checkedAt: copy.checkedAt };
}

type Shown = Banner["warnings"][number];

/** The block's items: one per warning in force or to come, the powiat's. */
export function weatherUpcoming(data: Weather): Item[] {
  return (data.banner?.warnings ?? []).map((warning) => ({
    module: "pogoda",
    span: span(warsawDay(Date.parse(warning.from)), warning.from, warning.to),
    shownFrom: null,
    event: warning.event.charAt(0).toLowerCase() + warning.event.slice(1),
    level: { tag: warning.tag, text: warning.level },
    second: "Cały powiat.",
    secondUntil: null,
  }));
}

/**
 * "piątek, 30 października, 13:00–23:00", or "13:00 – sobota,
 * 31 października, 2:00" across midnight: absolute, so a cached copy stays
 * true (the island puts „Dziś” or „Jutro” before it).
 */
function when(warning: Shown): string {
  const from = Date.parse(warning.from);
  const to = Date.parse(warning.to);
  const end = warsawDay(to);
  const day = warsawDay(from);
  return end === day
    ? `${absoluteDay(day)}, ${clockTime(from)}–${clockTime(to)}`
    : `${absoluteDay(day)}, ${clockTime(from)} – ${absoluteDay(end)}, ${clockTime(to)}`;
}

/**
 * The section's lines: the notice first when the copy is old (its link
 * IMGW's page); then per warning, its event and level (the tag), then
 * when, its day first; then where, as the water's cut, together; with
 * neither, that there is no warning.
 */
export function weatherStatus(data: Weather): Group[] {
  if (!data.banner)
    return [[["Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."]]];
  const { notice, warnings } = data.banner;
  const groups: Group[] = [];
  if (notice)
    groups.push([
      [
        `${notice} ${CURRENT.text} `,
        { href: IMGW_PAGE, text: CURRENT.link },
        ".",
      ],
    ]);
  if (warnings.length > 0)
    groups.push([
      ...warnings.flatMap((warning) => [
        [`${warning.event} `, { tag: warning.tag, text: warning.level }],
        [{ day: warsawDay(Date.parse(warning.from)), text: when(warning) }],
      ]),
      ["Gdzie: cały powiat lubaczowski"],
    ]);
  return groups;
}

/** „Źródło”: IMGW's page. */
export function weatherSources(): Part[][] {
  return [[{ href: IMGW_PAGE, text: SHORT }]];
}

/** The last good check of IMGW: „Ostatnio sprawdziliśmy …”. */
export function weatherChecked(data: Weather): Date {
  return new Date(data.checkedAt);
}
