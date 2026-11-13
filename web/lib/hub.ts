// The address page as a hub of modules (lib/modules.ts, components/hub.tsx):
// what a module gives it, its items' spans (lib/upcoming.ts), the
// subpages' source line and the freshness line. Pure, so the unit tests
// read it.

import { CADENCES, type Cadence } from "./cadence.ts";
import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";
import { addDays, capitalised, WARSAW, warsawToIso } from "./dates.ts";
import { LOCALE } from "./locale.ts";
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

/** Spaces as no-break spaces: a day and its time never break (t373). */
const unbroken = (text: string) => text.replaceAll(" ", "\u00a0");

const SHORT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: WARSAW,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant as "13.11, 17:45" (DD.MM, HH:MM), Polish time. */
export function shortDayTime(at: number): string {
  const part = (type: string) =>
    SHORT.formatToParts(at).find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}, ${part("hour")}:${part("minute")}`;
}

/**
 * A live source in a freshness line: its name (null: a subpage's one
 * source), when its data last changed (ms; null: none shown) and how often
 * it is checked (lib/cadence.ts).
 */
export type FreshSource = {
  name: string | null;
  changedAt: number | null;
  cadence: Cadence;
};

/**
 * Under a freshness line: how often its sources are checked, from
 * vercel.json's schedules (lib/cadence.ts). One cadence: „Sprawdzamy co 15
 * minut.”; several, each with its sources: „Sprawdzamy co 15 minut:
 * pogoda, prąd; co 4 godziny: woda.”. The sources freshnessLine shows
 * only; none: null.
 */
export function cadenceLine(sources: FreshSource[]): string | null {
  const shown = sources.filter(({ changedAt }) => changedAt !== null);
  const groups = (Object.keys(CADENCES) as Cadence[]).flatMap((cadence) => {
    const names = shown.filter((s) => s.cadence === cadence);
    return names.length > 0 ? [{ cadence, names }] : [];
  });
  if (groups.length === 0) return null;
  if (groups.length === 1)
    return `Sprawdzamy co ${CADENCES[groups[0].cadence].every}.`;
  return `Sprawdzamy ${groups
    .map(
      ({ cadence, names }) =>
        `co ${CADENCES[cadence].every}: ${names.map((s) => s.name).join(", ")}`,
    )
    .join("; ")}.`;
}

/** The no-data failure, as a tile's value with no subject (t427 glossary 6). */
export const UNCHECKED = "Nie udało się nam sprawdzić";

/** No data at all: „Nie udało się nam sprawdzić ‹subject›.” */
export const uncheckedText = (subject: string) => `${UNCHECKED} ${subject}.`;

/** A module with no data now, by its subject. */
export const unchecked = (module: { subject: string }) =>
  uncheckedText(module.subject);

/**
 * A subpage's source line, the first of its source note's
 * (components/subpage-parts.tsx SourceNote): „Źródło: ‹its sources, joined
 * with ;›.”; none: no parts.
 */
export function sourceLine(sources: Part[][]): Part[] {
  if (sources.length === 0) return [];
  return merged([
    "Źródło: ",
    ...sources.flatMap((source, i) => (i > 0 ? ["; ", ...source] : source)),
    ".",
  ]);
}

/**
 * The freshness line of the live sources (weather, power, water): when
 * each one's data last actually changed (its changedAt, written by the
 * cron only when its content changes), never when it was last checked, so
 * the line changes only when the page does. One unnamed source (a
 * subpage's): „Bez zmian od 13.11, 17:45.”; named ones (the address page,
 * the home panel), in the order given: „Bez zmian od: pogoda 13.11, 17:45;
 * woda 12.11, 08:00.”. A source with no changedAt is left out (the waste
 * schedule: its source line says it all); none left: null.
 */
export function freshnessLine(sources: FreshSource[]): string | null {
  const known = sources.flatMap(({ name, changedAt }) =>
    changedAt === null ? [] : [{ name, at: unbroken(shortDayTime(changedAt)) }],
  );
  if (known.length === 0) return null;
  if (known.length === 1 && known[0].name === null)
    return `Bez zmian od ${known[0].at}.`;
  return `Bez zmian od: ${known.map(({ name, at }) => `${name ?? ""} ${at}`.trim()).join("; ")}.`;
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
