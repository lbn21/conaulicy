// The home page's „Teraz w gminie” panel (components/now-panel.tsx): one
// tile per module, gmina-wide, for the current week (Monday to Sunday, the
// Warsaw day of the read). Pure: the tiles' shape, the week and the
// aggregates from what the stores hold, so tests read every state. The
// registry with the reads is components/now-tiles.ts.

import { warsawDay } from "./date-labels.ts";
import { addDays } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import { hasSource } from "./event-source.ts";
import type { Checked } from "./hub.ts";
import type { ShownWarning } from "./imgw-shown.ts";
import { LOCALE } from "./locale.ts";
import type { PgeFeed } from "./pge-feed.ts";

/** A link: a source (external, a plain <a>) or a place on the site. */
export type NowLink = { href: string; text: string };

/** What one tile shows; every tile is drawn by one NowTile. */
export type NowTileData = {
  /** The headline: „2 przerwy”, „Silny wiatr”, „Brak przerw”. */
  value: string;
  /** The line under it, stating the window: „w tym tygodniu”. */
  note: string;
  /** Nothing to report (or nothing could be read): the value muted. */
  empty: boolean;
  /** An active alert: the tile spans the whole row (the only span). */
  featured?: boolean;
  /** A level tag above the value (IMGW's 1-3), in IMGW's level colour. */
  tag?: { text: string; level: 1 | 2 | 3 };
  /** An optional call to action on the site („Sprawdź swój termin”). */
  action?: NowLink & { href: `#${string}` };
  /** When the source was last checked (a day alone: a string); null: unknown. */
  checkedAt: Checked;
};

/** The current week: Monday, Sunday and the next Monday (ISO days). */
export type Week = { from: string; to: string; until: string };

export function weekOf(today: string): Week {
  // 0 Monday … 6 Sunday, from the day's own date (noon UTC, no zone shift).
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(today, -weekday);
  return { from, to: addDays(from, 6), until: addDays(from, 7) };
}

const plurals = new Intl.PluralRules(LOCALE);

/** „1 przerwa”, „2 przerwy”, „5 przerw”: Polish plural forms. */
export function counted(n: number, [one, few, many]: [string, string, string]) {
  const form = plurals.select(n);
  return `${n} ${n === 1 ? one : form === "few" ? few : many}`;
}

/**
 * Planned water cuts starting this week, gmina-wide, with a source: one per
 * post, day and hours (a post cutting many streets at once is one cut).
 */
export function waterWeek(
  cuts: Disruption[],
  week: Week,
  checkedAt: (d: Disruption) => string | null,
) {
  const keys = new Set(
    cuts
      .filter(
        (d) =>
          d.cause === "planned" &&
          d.date >= week.from &&
          d.date <= week.to &&
          hasSource({ sourceUrl: d.source.url, checkedAt: checkedAt(d) }),
      )
      .map((d) => `${d.source.url}|${d.date}|${d.start}|${d.end}`),
  );
  return keys.size;
}

/** PGE's planned outages (not revoked) with a range in the week. */
export function powerWeek(feed: PgeFeed, week: Week) {
  return feed.items.filter(
    (item) =>
      item.kind === "planned" &&
      !item.revoked &&
      item.ranges.some(
        (r) =>
          warsawDay(Date.parse(r.start)) <= week.to &&
          warsawDay(Date.parse(r.end)) >= week.from,
      ),
  ).length;
}

/** The warning to show: the highest level, then the earliest. */
export function topWarning(warnings: ShownWarning[]): ShownWarning | null {
  return (
    [...warnings].sort(
      (a, b) => b.level - a.level || a.from.localeCompare(b.from),
    )[0] ?? null
  );
}
