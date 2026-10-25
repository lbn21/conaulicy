// The address page as a hub of modules (lib/modules.ts, components/hub.tsx):
// what a module gives it, and the alert slot's rules. Pure, so the unit
// tests read it.
import { clockTime, dayMonth } from "./date-labels.ts";
import { warsawNoon } from "./dates.ts";

/** A link; `hidden` follows its text for screen readers only. */
type Link = { href: string; text: string; hidden?: string };

/** Bins, drawn with their marks (components/waste-bins.tsx). */
export type Bins = {
  bins: Array<{ id: string; subtype: string; label: string }>;
};

/** A row's or a line's content, in order: text, links and bins. */
export type Part = string | Link | Bins;

/** One row of a module's card: key, value. */
export type SummaryRow = [string, Part[]];

/** Something to warn about, in the slot above the cards. */
export type Alert = {
  /** A full sentence, with an absolute date. */
  text: string;
  /** Its details: the subpage, or the source's own page. */
  href: string;
  /** The link's text, saying where it goes: „Więcej o tej przerwie”. */
  link: string;
  /** The source, short: "IMGW-PIB". */
  short: string;
  /** When it starts (ISO): the soonest first. */
  from: string;
};

/** Lines in the slot; the rest are behind „I jeszcze N …”. */
export const MAX_ALERTS = 2;

/**
 * The slot: every module's alerts in registry order, each module's soonest
 * first; at most `max` shown, `more` left for the cards below.
 */
export function alertSlot<T extends { order: number; alert: Alert }>(
  alerts: T[],
  max = MAX_ALERTS,
): { shown: T[]; more: number } {
  const sorted = alerts.toSorted(
    (a, b) =>
      a.order - b.order || Date.parse(a.alert.from) - Date.parse(b.alert.from),
  );
  return {
    shown: sorted.slice(0, max),
    more: Math.max(0, sorted.length - max),
  };
}

/** "1 ostrzeżenie", "3 ostrzeżenia", "5 ostrzeżeń", "22 ostrzeżenia". */
export function warningCount(n: number): string {
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${n === 1 ? "ostrzeżenie" : few ? "ostrzeżenia" : "ostrzeżeń"}`;
}

/**
 * When a module last checked its source (Module.checkedAt): an instant, or
 * a day ("2026-10-23") when the source keeps no time.
 */
export type Checked = Date | string | null;

/**
 * When a module last checked its source, in Polish time, absolute: "Ostatnio
 * sprawdziliśmy: 25 października, 14:20", or "… 23 października" for a day.
 * null: nothing to say.
 */
export function checkedLine(at: Checked): string | null {
  if (!at) return null;
  if (typeof at === "string")
    return `Ostatnio sprawdziliśmy: ${dayMonth(warsawNoon(at).getTime())}`;
  const ms = at.getTime();
  return `Ostatnio sprawdziliśmy: ${dayMonth(ms)}, ${clockTime(ms)}`;
}
