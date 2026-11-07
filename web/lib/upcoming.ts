// The address page's „Najbliższe dni” timeline (components/upcoming.tsx,
// task 261): what each module gives the block (Item), the one order, the
// days of the window (timeline) and each card's words. The server makes every label, absolute (dates,
// clock times); only „Dziś”, „Jutro” and „Za 5 dni” follow the day
// (components/day-word.tsx, lib/dates.ts dayLead), with no locale formatting, and the
// unit tests' from a fixed day. Pure and client-safe.
import { MODULE_IDS } from "./address-routes.ts";
import { addDays, capitalised, todayInWarsaw } from "./dates.ts";

/** When something happens, with its labels made on the server. */
export type Span = {
  /** ISO instants; without a time, its day's 0:00 and the next day's. */
  start: string;
  end: string;
  /** The Warsaw days of start and end. */
  day: string;
  endDay: string;
  /** "8:00"; null when the source gives no time. */
  from: string | null;
  to: string | null;
  /** The end is the source's estimate: „ok. 16:00”. */
  about: boolean;
  /** The start's day, absolute: "piątek, 30 października". */
  date: string;
  /** The start's day after „od”: "piątku 30 października". */
  since: string;
  /** The end's day after „do”: "soboty 31 października". */
  until: string;
};

/** IMGW's level, as its tag: the colour never the only signal. */
export type Tag = { tag: string; text: string };

type Base = {
  span: Span;
  /** In the block from this instant on (ISO); null: once announced. */
  shownFrom: string | null;
  /** The second sentence (where, or when to put the bins out); or null. */
  second: string | null;
  /** The second sentence is dropped at this instant (ISO); null: never. */
  secondUntil: string | null;
};

/** One line of the block: a module's cut, warning or pickup. */
export type Item = Base &
  (
    | { module: "woda"; emergency: boolean }
    /** `event` lower-case, in running text: "silny wiatr". */
    | { module: "pogoda"; event: string; level: Tag }
    /** "papier, szkło" or "wszystkie pojemniki". */
    | { module: "smieci"; bins: string }
  );

/**
 * The one order: start, then end, then the registry (MODULE_IDS). It does
 * not depend on the time, so a cached page never reorders, it only rewords
 * and hides.
 */
export function ordered(items: Item[]): Item[] {
  const at = (iso: string) => Date.parse(iso);
  return items.toSorted(
    (a, b) =>
      at(a.span.start) - at(b.span.start) ||
      at(a.span.end) - at(b.span.end) ||
      MODULE_IDS.indexOf(a.module) - MODULE_IDS.indexOf(b.module),
  );
}

/** In the block at `now`: shown from its shownFrom, until its end. */
export const visible = (item: Item, now: number) =>
  (item.shownFrom === null || Date.parse(item.shownFrom) <= now) &&
  now < Date.parse(item.span.end);

/** The block's window: today and the next six days (task 261). */
export const WINDOW_DAYS = 7;

/** A day on the timeline with what happens on it, in the one order. */
export type DayRow = { kind: "day"; day: string; items: Item[] };

/** A run of days with nothing on them: one line, `from` to `to`. */
export type EmptyRow = { kind: "empty"; from: string; to: string };

/**
 * The timeline at `now` (task 261): every day of the window, today first,
 * as a day with its items or, for days with none, one line per run of
 * empty days; then `later`, the days past the window that have something
 * (a cut announced further ahead), with no empty lines between them. An
 * item is on its start's day, or today if it began earlier and is not
 * over: once, never on each day it lasts.
 */
export function timeline(
  items: Item[],
  now: number,
): { week: Array<DayRow | EmptyRow>; later: DayRow[] } {
  const today = todayInWarsaw(new Date(now));
  const byDay = new Map<string, Item[]>();
  for (const item of items.filter((it) => visible(it, now))) {
    const day = item.span.day < today ? today : item.span.day;
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const week: Array<DayRow | EmptyRow> = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(today, i);
    const dayItems = byDay.get(day);
    const last = week.at(-1);
    if (dayItems) week.push({ kind: "day", day, items: dayItems });
    else if (last?.kind === "empty") last.to = day;
    else week.push({ kind: "empty", from: day, to: day });
  }
  const end = addDays(today, WINDOW_DAYS - 1);
  const later = [...byDay]
    .filter(([day]) => day > end)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]): DayRow => ({ kind: "day", day, items: dayItems }));
  return { week, later };
}

/**
 * A card's words on its timeline `day`: when (its hours, „Od 8:00 do
 * 16:00”, or null with none), what happens (IMGW's level as its tag), and
 * the second sentence. The date is the day's, above the card, so it is
 * named here only when another day's: the start's, when the item began
 * before `day` („Od czwartku 29 października, 22:00 do 4:00”), the end's
 * when it ends after. The second sentence is dropped at its secondUntil,
 * as of `now` (the block is read per request). Absolute only.
 */
export type CardWords = {
  when: string | null;
  text: Array<string | Tag>;
  second: string | null;
};

export function cardWords(item: Item, day: string, now: number): CardWords {
  const { span } = item;
  const earlier = span.day !== day;
  const since = earlier
    ? `od ${span.since}${span.from ? `, ${span.from}` : ""}`
    : span.from && `od ${span.from}`;
  const endDay = span.endDay === day ? "" : `${span.until}, `;
  const until = span.to && `do ${endDay}${span.about ? "ok. " : ""}${span.to}`;
  const hours = [since, until].filter(Boolean).join(" ");
  const second =
    item.secondUntil === null || now < Date.parse(item.secondUntil)
      ? item.second
      : null;
  const when = hours ? capitalised(hours) : null;
  switch (item.module) {
    case "woda": {
      // A failure: „(awaria)” right after what happens.
      const cut = item.emergency ? " (awaria)" : "";
      const text =
        span.from && span.to
          ? `Nie będzie wody${cut}.`
          : span.from
            ? `Nie będzie wody${cut}. Komunikat nie podaje, do której.`
            : span.to
              ? `Nie będzie wody${cut}.`
              : `Będzie przerwa w dostawie wody${cut}. Komunikat nie podaje godzin.`;
      return { when, text: [text], second };
    }
    case "pogoda":
      return {
        when,
        text: [`Ostrzeżenie IMGW – ${item.event} `, item.level],
        second,
      };
    case "smieci":
      return { when, text: [`Odbiorą: ${item.bins}.`], second };
  }
}
