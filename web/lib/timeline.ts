// The address page's timeline (components/timeline.tsx, task 263): the
// next N Warsaw days from the read's day, each with what happens on it at
// this address, one entry per module's item (lib/upcoming.ts Item, from
// each module's adapter, Module.events), in registry order; a run of 2+
// empty days after today as one range; and „Później”, the next item per
// module after the window. Pure, so the unit tests read it.
import { MODULE_IDS, type ModuleId } from "./address-routes.ts";
import { addDays, warsawToIso } from "./dates.ts";
import type { Item } from "./upcoming.ts";

/** An item on a day; `continued`: it started on an earlier day („trwa”). */
export type Entry = { item: Item; continued: boolean };

/** A card: one day (from === to) or a run of empty days. */
export type DayGroup = { from: string; to: string; entries: Entry[] };

const midnight = (day: string) =>
  Date.parse(warsawToIso(`${day} 00:00:00`) ?? `${day}T00:00:00Z`);

/** today … today+n-1, Warsaw days (DST-safe: calendar days). */
export function days(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

const order = (a: Item, b: Item) =>
  MODULE_IDS.indexOf(a.module) - MODULE_IDS.indexOf(b.module) ||
  Date.parse(a.span.start) - Date.parse(b.span.start) ||
  Date.parse(a.span.end) - Date.parse(b.span.end);

/**
 * What happens on `day`: every item overlapping it and not over at `now`,
 * in registry order, then by start. A multi-day item is on each day it
 * covers, `continued` on all but its first.
 */
export function onDay(items: Item[], day: string, now: number): Entry[] {
  const from = midnight(day);
  const to = midnight(addDays(day, 1));
  return items
    .filter(
      (item) =>
        Date.parse(item.span.start) < to &&
        Date.parse(item.span.end) > from &&
        Date.parse(item.span.end) > now,
    )
    .toSorted(order)
    .map((item) => ({ item, continued: Date.parse(item.span.start) < from }));
}

/** The first item per module starting after `lastDay`, in registry order. */
export function later(items: Item[], lastDay: string): Item[] {
  const after = midnight(addDays(lastDay, 1));
  const firsts = new Map<ModuleId, Item>();
  for (const item of items.toSorted(order))
    if (Date.parse(item.span.start) >= after && !firsts.has(item.module))
      firsts.set(item.module, item);
  return MODULE_IDS.flatMap((id) => firsts.get(id) ?? []);
}

/**
 * The days as cards: today always its own; after it, a run of 2 or more
 * empty days is one card (from – to); a single empty day stays its own.
 */
export function collapse(list: string[], byDay: Entry[][]): DayGroup[] {
  const groups: DayGroup[] = [];
  list.forEach((day, i) => {
    const last = groups.at(-1);
    const empty = byDay[i].length === 0;
    if (
      i > 1 &&
      empty &&
      last &&
      last.entries.length === 0 &&
      last.from !== list[0]
    )
      last.to = day;
    else groups.push({ from: day, to: day, entries: byDay[i] });
  });
  return groups;
}
