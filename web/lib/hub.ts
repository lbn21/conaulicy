// The address page as a hub of modules (lib/modules.ts, components/hub.tsx):
// what a module gives it, the alert slot's rules and each section's meta
// line. Pure, so the unit tests read it.

import type { ModuleId } from "./address-routes.ts";
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

/** One line of a module's section: a paragraph, or a row of bins. */
type Line = Part[];

/**
 * Lines that belong together (a date and its bins): close under each other
 * (GOV.UK's spacing 2), the group a paragraph's gap from the next.
 */
export type Group = Line[];

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
  /** The source's own post, if any: then linked as „Źródło: komunikat …”. */
  sourceHref?: string;
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

/** "przerwa" → "Przerwa". */
export const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
