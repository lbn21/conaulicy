// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat, filtered as the banner (lib/imgw-banner.ts), from
// the same copy of the feed. Pure, so the unit tests read every state.
import { clockTime, warsawDay } from "./date-labels.ts";
import { absoluteDay } from "./dates.ts";
import { type Group, type Part, span } from "./hub.ts";
import { type Banner, banner, fresh, IMGW_PAGE } from "./imgw-banner.ts";
import type { Feed } from "./imgw-warnings.ts";
import type { Item } from "./upcoming.ts";

export type Weather = {
  /** null: no warning in force or to come. */
  banner: Banner | null;
  fetchedAt: number;
  stale: boolean;
};

/** The source, short. */
const SHORT = "IMGW-PIB";

/**
 * The module's data, or null when the banner would show nothing for want of
 * a copy (none, or 3 hours old or older): then the address page leaves the
 * weather out, as other pages leave out the banner.
 */
export function weather(
  found: { feed: Feed; stale: boolean } | null,
  now: number,
): Weather | null {
  if (!fresh(found, now)) return null;
  return {
    banner: banner(found, now),
    fetchedAt: Date.parse(found.feed.fetchedAt),
    stale: found.stale,
  };
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
 * The section's lines, together: per warning, its event and level (the
 * tag), then when, its day first; then where, as the water's cut; without
 * one, that there is none.
 */
export function weatherStatus(data: Weather): Group[] {
  if (!data.banner)
    return [[["Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."]]];
  return [
    [
      ...data.banner.warnings.flatMap((warning) => [
        [`${warning.event} `, { tag: warning.tag, text: warning.level }],
        [{ day: warsawDay(Date.parse(warning.from)), text: when(warning) }],
      ]),
      ["Gdzie: cały powiat lubaczowski"],
    ],
  ];
}

/** „Źródło”: IMGW's page, and if the copy is stale. */
export function weatherSources(data: Weather): Part[][] {
  return [
    [
      { href: IMGW_PAGE, text: SHORT },
      ...(data.stale ? [". Nowszych danych nie udało się pobrać"] : []),
    ],
  ];
}

/** When the copy of the feed was fetched: „Ostatnio sprawdziliśmy …”. */
export function weatherChecked(data: Weather): Date {
  return new Date(data.fetchedAt);
}
