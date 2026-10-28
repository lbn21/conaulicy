// The address page's „Najbliższe dni” block (components/upcoming.tsx) and
// its sections' day leads: what each module gives the block (Item), the one
// order, and the words at an instant. The server makes every absolute label
// (dates, clock times); this file only compares Warsaw days and instants,
// so the island picks the words from the device's clock with no locale
// formatting, and the unit tests from a fixed one. Pure and client-safe.
import { MODULE_IDS, type ModuleId } from "./address-routes.ts";
import { addDays, todayInWarsaw } from "./dates.ts";

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

/** The device's clock, unless it is over 5 minutes before the render. */
const SKEW_MS = 5 * 60_000;
export const trusted = (now: number, renderedAt: number) =>
  now < renderedAt - SKEW_MS ? renderedAt : now;

/** "przerwa" → "Przerwa". */
export const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** A line's words: the lead (bold), the rest, the second sentence. */
export type Words = {
  lead: string;
  text: Array<string | Tag>;
  second: string | null;
};

/**
 * An item's words at `now`. Under way (it has started: at its time, or on
 * an earlier day): „Teraz”; else „Dziś”, „Jutro” or its date. The end's
 * day is named only when it is not the lead's: „do jutra, 2:00”.
 */
export function words(item: Item, now: number): Words {
  const { span } = item;
  const today = todayInWarsaw(new Date(now));
  const tomorrow = addDays(today, 1);
  const going =
    now >= Date.parse(span.start) && (span.from !== null || span.day < today);
  const day =
    span.day === today ? "Dziś" : span.day === tomorrow ? "Jutro" : null;
  const ref = going ? today : span.day;
  const endDay =
    span.endDay === ref
      ? ""
      : span.endDay === tomorrow
        ? "jutra, "
        : `${span.until}, `;
  const end = span.to && `${endDay}${span.about ? "ok. " : ""}${span.to}`;
  const second =
    item.secondUntil === null || now < Date.parse(item.secondUntil)
      ? item.second
      : null;
  // „Piątek, 30 października:” before the rest; a word needs no colon.
  const lead = going ? "Teraz" : (day ?? `${capitalised(span.date)}:`);
  switch (item.module) {
    case "woda": {
      const cut = item.emergency ? "awaria – " : "";
      const until = end
        ? ` – do ${end}.`
        : ". Komunikat nie podaje, do której.";
      if (going) return { lead, text: [`${cut}nie ma wody${until}`], second };
      const text =
        span.from && end
          ? `od ${span.from} do ${end} nie będzie wody.`
          : span.from
            ? `od ${span.from} nie będzie wody. Komunikat nie podaje, do której.`
            : end
              ? `do ${end} nie będzie wody.`
              : "będzie przerwa w dostawie wody. Komunikat nie podaje godzin.";
      return { lead, text: [`${cut}${text}`], second };
    }
    case "pogoda":
      return {
        lead: going
          ? "Teraz:"
          : day
            ? `${day} od ${span.from}:`
            : `${capitalised(span.date)}, od ${span.from}:`,
        text: [`ostrzeżenie IMGW – ${item.event} `, item.level, `, do ${end}.`],
        second,
      };
    case "smieci":
      return { lead, text: [`odbiór śmieci: ${item.bins}.`], second };
  }
}

/**
 * A section's first line: „Dziś: ”, „Jutro: ” or „Za 5 dni: ” (2 to 7 days)
 * before the absolute `text`; further, or past, the text alone.
 */
export function dayLead(day: string, text: string, now: number): string {
  const today = todayInWarsaw(new Date(now));
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
