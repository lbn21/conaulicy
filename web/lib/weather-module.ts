// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat, filtered as the banner (lib/imgw-banner.ts), from
// the same copy of the feed. Pure, so the unit tests read every state.
import type { Alert, Group, Part } from "./hub.ts";
import { type Banner, banner, fresh, IMGW_PAGE } from "./imgw-banner.ts";
import type { Feed } from "./imgw-warnings.ts";

export type Weather = {
  /** null: no warning in force or to come. */
  banner: Banner | null;
  fetchedAt: number;
  stale: boolean;
};

/** The source, short, after an alert. */
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

/** One per warning: "Silny wiatr, stopień 1 z 3. Obowiązuje teraz, do …." */
export function weatherAlerts(data: Weather): Alert[] {
  return (data.banner?.warnings ?? []).map((warning) => ({
    text: `${warning.event}, ${warning.level.toLowerCase()}. ${warning.when}`,
    href: IMGW_PAGE,
    link: "Więcej na meteo.imgw.pl",
    short: SHORT,
    from: warning.from,
  }));
}

/**
 * The section's lines, together: one per warning, its level and when,
 * absolute ("Silny wiatr – stopień 1 z 3, do niedzieli 25 października,
 * 2:00."), then where, as the water's cut; without one, that there is none.
 */
export function weatherStatus(data: Weather): Group[] {
  if (!data.banner)
    return [[["Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."]]];
  return [
    [
      ...data.banner.warnings.map((warning) => [
        `${warning.event} – ${warning.level.toLowerCase()}, ${warning.short}.`,
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
