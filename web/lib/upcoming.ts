// The address page's „Najbliższe dni” block (components/upcoming.tsx) and
// its sections' day leads: what each module gives the block (Item), the one
// order, and its words. The server makes every label, absolute (dates,
// clock times); only „Dziś”, „Jutro” and „Za 5 dni” are the device's
// (components/day-word.tsx, dayLead), with no locale formatting, and the
// unit tests' from a fixed day. Pure and client-safe.
import { MODULE_IDS, type ModuleId } from "./address-routes.ts";

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

/** The link's hidden end: „Szczegóły i źródło: woda”. */
export const LINK_NAME: Record<ModuleId, string> = {
  smieci: "odbiór śmieci",
  woda: "woda",
  pogoda: "pogoda",
};

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

/** "przerwa" → "Przerwa". */
export const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A line's words: the lead (bold), as the device's „Dziś” or „Jutro” and
 * what follows that word (components/day-word.tsx), or else the date
 * („Piątek, 30 października:”); the rest; the second sentence.
 */
export type Words = {
  day: string;
  /** After „Dziś” or „Jutro”: "" for a cut or a pickup, „ od 13:00:” for a warning. */
  afterWord: string;
  /** The lead when the day is neither. */
  date: string;
  text: Array<string | Tag>;
  second: string | null;
};

/**
 * An item's words: absolute only, so the server says nothing that depends
 * on today; the end's day is named when it is not the start's: „do
 * czwartku 29 października, 4:00”. The second sentence is dropped at its
 * secondUntil, as of `now` (the block is read per request).
 */
export function words(item: Item, now: number): Words {
  const { span } = item;
  const endDay = span.endDay === span.day ? "" : `${span.until}, `;
  const end = span.to && `${endDay}${span.about ? "ok. " : ""}${span.to}`;
  const second =
    item.secondUntil === null || now < Date.parse(item.secondUntil)
      ? item.second
      : null;
  const date = capitalised(span.date);
  const lead = { day: span.day, afterWord: "", date: `${date}:` };
  switch (item.module) {
    case "woda": {
      // A failure: „(awaria)” right after what happens.
      const cut = item.emergency ? " (awaria)" : "";
      const text =
        span.from && end
          ? `od ${span.from} do ${end} nie będzie wody${cut}.`
          : span.from
            ? `od ${span.from} nie będzie wody${cut}. Komunikat nie podaje, do której.`
            : end
              ? `do ${end} nie będzie wody${cut}.`
              : `będzie przerwa w dostawie wody${cut}. Komunikat nie podaje godzin.`;
      return { ...lead, text: [text], second };
    }
    case "pogoda": {
      // A missing time left out, as the water's: no „od”, no „do”.
      const from = span.from ? ` od ${span.from}` : "";
      return {
        day: span.day,
        afterWord: `${from}:`,
        date: `${date}${from && `,${from}`}:`,
        text: [
          `ostrzeżenie IMGW – ${item.event} `,
          item.level,
          end ? `, do ${end}.` : ".",
        ],
        second,
      };
    }
    case "smieci":
      return { ...lead, text: [`odbiór śmieci: ${item.bins}.`], second };
  }
}

/**
 * A section's first line on `today` (a Warsaw day): „Dziś: ”, „Jutro: ” or
 * „Za 5 dni: ” (2 to 7 days) before the absolute `text`; further, or past,
 * the text alone.
 */
export function dayLead(day: string, text: string, today: string): string {
  const n = (Date.parse(day) - Date.parse(today)) / 86_400_000;
  const lead =
    n === 0
      ? "Dziś"
      : n === 1
        ? "Jutro"
        : n >= 2 && n <= 7
          ? `Za ${n} dni`
          : null;
  return lead ? `${lead}: ${text}` : capitalised(text);
}
