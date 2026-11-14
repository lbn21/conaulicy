// The address page's timeline (components/timeline.tsx): the
// window's Warsaw days from the read's day (lib/window.ts), each with what happens on it at
// this address, one entry per module's item (lib/upcoming.ts Item, from
// each module's adapter, Module.events), in registry order; a run of 2+
// empty days as one range, today included; and „Później”, the next item
// after the window of each module with nothing left in it. Pure, so the
// unit tests read it.
import { MODULE_IDS, type ModuleId } from "./address-routes.ts";
import { addDays, warsawToIso } from "./dates.ts";
import type { Item, Span } from "./upcoming.ts";
import type { Window } from "./window.ts";

/** An item on a day; `continued`: it started on an earlier day („trwa”). */
export type Entry = { item: Item; continued: boolean };

/** A card: one day (from === to) or a run of empty days. */
export type DayGroup = { from: string; to: string; entries: Entry[] };

const midnight = (day: string) =>
  Date.parse(warsawToIso(`${day} 00:00:00`) ?? `${day}T00:00:00Z`);

const order = (a: Item, b: Item) =>
  MODULE_IDS.indexOf(a.module) - MODULE_IDS.indexOf(b.module) ||
  Date.parse(a.span.start) - Date.parse(b.span.start) ||
  Date.parse(a.span.end) - Date.parse(b.span.end);

/**
 * The site's one rule for whether something is shown between `from` and
 * `to` (ms) at `now`: it overlaps them and is not over. An estimated end
 * (`about`, a PGE failure's) never ends it: it lasts at least until `now`,
 * as long as its source lists it (lib/power-module.ts), so an overdue one
 * is on today, not on the days after.
 */
function shownIn(
  span: Pick<Span, "start" | "end" | "about">,
  from: number,
  to: number,
  now: number,
): boolean {
  const end = Date.parse(span.end);
  const lasts = span.about ? Math.max(end, now) : end;
  return (
    Date.parse(span.start) < to && lasts > from && (span.about || lasts > now)
  );
}

/** Whether a span is shown in the window (lib/window.ts) at `now`. */
export function inWindow(
  span: Pick<Span, "start" | "end" | "about">,
  range: Window,
  now: number,
): boolean {
  return shownIn(span, midnight(range.from), midnight(range.until), now);
}

/**
 * What happens on `day`: every item shown on it (shownIn), in registry
 * order, then by start. A multi-day item is on each day it covers,
 * `continued` on all but its first.
 */
export function onDay(items: Item[], day: string, now: number): Entry[] {
  const from = midnight(day);
  const to = midnight(addDays(day, 1));
  return items
    .filter((item) => shownIn(item.span, from, to, now))
    .toSorted(order)
    .map((item) => ({ item, continued: Date.parse(item.span.start) < from }));
}

/**
 * „Później”: the first item starting after `lastDay` of each module with
 * no entry in the window (`byDay`, onDay's per day), in registry order. A
 * module already in the window, or with nothing after it, is left out.
 */
export function later(
  items: Item[],
  lastDay: string,
  byDay: Entry[][],
): Item[] {
  const after = midnight(addDays(lastDay, 1));
  const firsts = new Map<ModuleId, Item>();
  for (const entries of byDay)
    for (const { item } of entries) firsts.set(item.module, item);
  const shown = new Set(firsts.keys());
  for (const item of items.toSorted(order))
    if (Date.parse(item.span.start) >= after && !firsts.has(item.module))
      firsts.set(item.module, item);
  return MODULE_IDS.flatMap((id) =>
    shown.has(id) ? [] : (firsts.get(id) ?? []),
  );
}

/**
 * The days as cards: a run of 2 or more empty days is one card (from –
 * to), today included; a single empty day stays its own.
 */
export function collapse(list: string[], byDay: Entry[][]): DayGroup[] {
  const groups: DayGroup[] = [];
  list.forEach((day, i) => {
    const last = groups.at(-1);
    const empty = byDay[i].length === 0;
    if (empty && last && last.entries.length === 0) last.to = day;
    else groups.push({ from: day, to: day, entries: byDay[i] });
  });
  return groups;
}
