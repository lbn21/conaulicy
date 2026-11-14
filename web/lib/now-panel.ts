// The home page's „Teraz w gminie” panel (components/now-panel.tsx): one
// tile per module, gmina-wide, for the site's 7-day window from the
// read's Warsaw day (lib/window.ts, the address page's). Pure: the tiles'
// shape and the aggregates from what the stores hold, so tests read every
// state. The
// registry with the reads is components/now-tiles.ts.

import { warsawDay } from "./date-labels.ts";
import type { Disruption } from "./disruptions.ts";
import { hasSource } from "./event-source.ts";
import type { ShownWarning } from "./imgw-shown.ts";
import { LOCALE } from "./locale.ts";
import type { PgeFeed } from "./pge-feed.ts";
import type { Window } from "./window.ts";

/** A link: a source (another site, a plain <a>) or a field on the page. */
export type NowLink = { href: string; text: string };

/** What one tile shows; every tile is drawn by one NowTile. */
export type NowTileData = {
  /** The headline: „2 przerwy”, „Silny wiatr”, „Brak przerw”. */
  value: string;
  /** The line under it, stating the window: „w ciągu 7 dni”. */
  note: string;
  /** Nothing to report (or nothing could be read): the value muted. */
  empty: boolean;
  /** An active alert: the tile spans the whole row (the only span). */
  featured?: boolean;
  /** A level tag above the value (IMGW's 1-3), in IMGW's level colour. */
  tag?: { text: string; level: 1 | 2 | 3 };
  /** When the source's data last changed (ms): the panel's freshness line; null: none. */
  changedAt: number | null;
};

const plurals = new Intl.PluralRules(LOCALE);

/** „1 przerwa”, „2 przerwy”, „5 przerw”: Polish plural forms. */
export function counted(n: number, [one, few, many]: [string, string, string]) {
  const form = plurals.select(n);
  return `${n} ${n === 1 ? one : form === "few" ? few : many}`;
}

/**
 * Planned water cuts starting in the window, gmina-wide, with a source: one
 * per post, day and hours (a post cutting many streets at once is one cut).
 */
export function waterInWindow(
  cuts: Disruption[],
  range: Window,
  checkedAt: (d: Disruption) => string | null,
) {
  const keys = new Set(
    cuts
      .filter(
        (d) =>
          d.cause === "planned" &&
          d.date >= range.from &&
          d.date <= range.to &&
          hasSource({ sourceUrl: d.source.url, checkedAt: checkedAt(d) }),
      )
      .map((d) => `${d.source.url}|${d.date}|${d.start}|${d.end}`),
  );
  return keys.size;
}

/** PGE's planned outages (not revoked) with a range in the window. */
export function powerInWindow(feed: PgeFeed, range: Window) {
  return feed.items.filter(
    (item) =>
      item.kind === "planned" &&
      !item.revoked &&
      item.ranges.some(
        (r) =>
          warsawDay(Date.parse(r.start)) <= range.to &&
          warsawDay(Date.parse(r.end)) >= range.from,
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
