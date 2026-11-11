// The address page as a hub of modules (lib/modules.ts, components/hub.tsx):
// what a module gives it, its items' spans (lib/upcoming.ts), the
// subpages' source line and the address page's freshness line. Pure, so
// the unit tests read it.

import {
  clockTime,
  dayGenitive,
  dayMonth,
  dayMonthTime,
  warsawDay,
} from "./date-labels.ts";
import { addDays, capitalised, warsawNoon, warsawToIso } from "./dates.ts";
import { LIST } from "./locale.ts";
import type { Span } from "./upcoming.ts";

export { capitalised };

/** A link; `hidden` follows its text for screen readers only. */
type Link = { href: string; text: string; hidden?: string };

/** Bins, drawn with their marks (components/waste-bins.tsx). */
export type Bins = {
  bins: Array<{ id: string; subtype: string; label: string }>;
};

/**
 * A section's first line: its absolute `text` ("piątek, 30 października"),
 * before which DayWord puts „Dziś”, „Jutro” or „Za 5 dni” (`day`, a
 * Warsaw day; lib/dates.ts dayLead).
 */
type DayLead = { day: string; text: string };

/** A row's or a line's content, in order: text, links and bins. */
export type Part = string | Link | Bins | DayLead;

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

/** "25 października 14:20", or "23 października" for a day; Polish time. */
const checkedWhen = (at: Date | string) =>
  typeof at === "string"
    ? dayMonth(warsawNoon(at).getTime())
    : dayMonthTime(at.getTime());

/** A module with no data now: „Nie udało się sprawdzić ‹its subject›.” */
export const unchecked = (module: { subject: string }) =>
  `Nie udało się sprawdzić ${module.subject}.`;

/**
 * A subpage's source line, in its inset at the bottom: „Źródło: ‹its
 * sources, joined with ;›.”, then „Sprawdziliśmy 25 października 14:20.”,
 * absolute. Each only when there is one; neither: no parts.
 */
export function sourceLine(sources: Part[][], at: Checked): Part[] {
  const parts: Part[] = [];
  if (sources.length > 0)
    parts.push(
      "Źródło: ",
      ...sources.flatMap((source, i) => (i > 0 ? ["; ", ...source] : source)),
      ".",
    );
  if (at) parts.push(` Sprawdziliśmy ${checkedWhen(at)}.`);
  const out = merged(parts);
  // No source before it: the line starts with the check.
  if (typeof out[0] === "string") out[0] = out[0].trimStart();
  return out;
}

/**
 * The address page's freshness line: „Sprawdziliśmy: śmieci 10 listopada
 * 22:40, woda 11 listopada 07:00 i pogoda 11 listopada 07:07.”, each
 * module with a known check, in registry order (Intl.ListFormat); none:
 * null.
 */
export function freshnessLine(
  checks: Array<{ name: string; at: Checked }>,
): string | null {
  const known = checks.flatMap(({ name, at }) =>
    at ? [`${name} ${checkedWhen(at)}`] : [],
  );
  return known.length > 0 ? `Sprawdziliśmy: ${LIST.format(known)}.` : null;
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
    until: dayGenitive(Date.parse(until)),
  };
}
