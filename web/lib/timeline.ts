// The address page's timeline (components/timeline.tsx): the
// next N Warsaw days from the read's day, each with what happens on it at
// this address, one entry per module's item (lib/upcoming.ts Item, from
// each module's adapter, Module.events), in registry order; a run of 2+
// empty days as one range, today included; and „Później”, the next item
// after the window of each module with nothing left in it. Pure, so the
// unit tests read it.
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
 * covers, `continued` on all but its first. An estimated end (`about`, a
 * PGE failure's) never ends an item: it is on as long as its source lists
 * it (lib/power-module.ts).
 */
export function onDay(items: Item[], day: string, now: number): Entry[] {
  const from = midnight(day);
  const to = midnight(addDays(day, 1));
  return items
    .filter(
      (item) =>
        Date.parse(item.span.start) < to &&
        Date.parse(item.span.end) > from &&
        (item.span.about || Date.parse(item.span.end) > now),
    )
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
