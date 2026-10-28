// The address page as a hub of modules (lib/modules.ts, components/hub.tsx):
// what a module gives it, its items' spans (lib/upcoming.ts) and each
// section's meta line. Pure, so the unit tests read it.

import type { ModuleId } from "./address-routes.ts";
import { clockTime, dayGenitive, dayMonth, warsawDay } from "./date-labels.ts";
import { absoluteDay, addDays, warsawNoon, warsawToIso } from "./dates.ts";
import { capitalised, type Span, type Tag } from "./upcoming.ts";

export { capitalised };

/** A link; `hidden` follows its text for screen readers only. */
type Link = { href: string; text: string; hidden?: string };

/** Bins, drawn with their marks (components/waste-bins.tsx). */
export type Bins = {
  bins: Array<{ id: string; subtype: string; label: string }>;
};

/**
 * A section's first line: its absolute `text` ("piątek, 30 października"),
 * before which the island puts „Dziś”, „Jutro” or „Za 5 dni” (`day`, a
 * Warsaw day; lib/upcoming.ts dayLead).
 */
type DayLead = { day: string; text: string };

/** A row's or a line's content, in order: text, links, bins and tags. */
export type Part = string | Link | Bins | Tag | DayLead;

/** One line of a module's section: a paragraph, or a row of bins. */
type Line = Part[];

/**
 * Lines that belong together (a date and its bins): close under each other
 * (GOV.UK's spacing 2), the group a paragraph's gap from the next.
 */
export type Group = Line[];

/**
 * When a module last checked its source (Module.checkedAt): an instant, or
 * a day ("2026-10-23") when the source keeps no time.
 */
export type Checked = Date | string | null;

/** What each module's check line says it checked; any other: „Ostatnio”. */
const CHECKED: Partial<Record<ModuleId, string>> = {
  smieci: "Wywozy sprawdziliśmy",
  woda: "Komunikaty o wodzie sprawdziliśmy",
};

/** "25 października, 14:20", or "23 października" for a day; Polish time. */
function checkedWhen(at: Date | string): string {
  if (typeof at === "string") return dayMonth(warsawNoon(at).getTime());
  const ms = at.getTime();
  return `${dayMonth(ms)}, ${clockTime(ms)}`;
}

/**
 * When a module last checked its source, on its subpage, in Polish time,
 * absolute: "Wywozy sprawdziliśmy: 25 października, 14:20", or "…
 * 23 października" for a day. null: nothing to say.
 */
export function checkedLine(at: Checked, module: ModuleId): string | null {
  if (!at) return null;
  return `${CHECKED[module] ?? "Ostatnio sprawdziliśmy"}: ${checkedWhen(at)}`;
}

/**
 * The last line of a module's section on the address page: „Źródło: ‹its
 * sources, joined with ;›.”, then `note` (a full sentence), then
 * „Sprawdziliśmy 25 października, 14:20.”, absolute.
 */
export function metaLine(
  sources: Part[][],
  note: string | null,
  at: Checked,
): Part[] {
  const parts: Part[] = [
    "Źródło: ",
    ...sources.flatMap((source, i) => (i > 0 ? ["; ", ...source] : source)),
    ".",
  ];
  if (note) parts.push(` ${note}`);
  if (at) parts.push(` Sprawdziliśmy ${checkedWhen(at)}.`);
  return merged(parts);
}

/** Adjacent texts as one, so the markup has no empty comments between. */
export function merged(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (typeof p === "string" && typeof last === "string")
      out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out;
}

const midnight = (d: string) => warsawToIso(`${d} 00:00:00`) ?? `${d}T00:00:00`;

/**
 * When an item on a Warsaw `day` is over (ISO): its `end`, an instant, else
 * the next day's 0:00 (the source gives no time). One rule for the block
 * (span) and the pages (lib/zuk.ts notOver).
 */
export const endOf = (day: string, end: string | null) =>
  end ?? midnight(addDays(day, 1));

/**
 * An item's span (lib/upcoming.ts) on a Warsaw `day`: `start` and `end` are
 * instants (ISO), or null when the source gives no time (then its day's
 * 0:00 and the next day's); `about`, the end is an estimate.
 */
export function span(
  day: string,
  start: string | null,
  end: string | null,
  about = false,
): Span {
  const until = endOf(day, end);
  return {
    start: start ?? midnight(day),
    end: until,
    day,
    endDay: end ? warsawDay(Date.parse(end)) : day,
    from: start ? clockTime(Date.parse(start)) : null,
    to: end ? clockTime(Date.parse(end)) : null,
    about,
    date: absoluteDay(day),
    until: dayGenitive(Date.parse(until)),
  };
}
