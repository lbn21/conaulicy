// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat, filtered as the banner (lib/imgw-banner.ts), from
// the same copy of the feed. Pure, so the unit tests read every state.
import { clockTime, longDate, warsawDay } from "./date-labels.ts";
import type { Alert, Part, SummaryRow } from "./hub.ts";
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
    short: SHORT,
    from: warning.from,
  }));
}

/** The card: one row per warning, then where it applies; null without one. */
export function weatherSummary(data: Weather): SummaryRow[] | null {
  if (!data.banner) return null;
  return [
    ...data.banner.warnings.map(
      (warning): SummaryRow => [
        warning.event,
        [`${warning.level}, ${warning.short}`],
      ],
    ),
    ["Gdzie", ["cały powiat lubaczowski"]],
  ];
}

/** „Źródło”: IMGW's page, when the copy was fetched, and if it is stale. */
export function weatherSources(data: Weather): Part[][] {
  const at = data.fetchedAt;
  return [
    [
      { href: IMGW_PAGE, text: SHORT },
      `, sprawdzono ${longDate(warsawDay(at))}, ${clockTime(at)}`,
      ...(data.stale ? [". Nowszych danych nie udało się pobrać"] : []),
    ],
  ];
}

/** When the copy of the feed was fetched: „Ostatnio sprawdziliśmy …”. */
export function weatherChecked(data: Weather): Date {
  return new Date(data.fetchedAt);
}
