// Server-only date labels for the street page, the PDF and the IMGW warning
// cards.
// Kept out of lib/dates.ts, which the client bundle imports. Relative
// imports, so the unit tests can load it (scripts/lib/server-only.mjs).
import "server-only";
import { todayInWarsaw, WARSAW, warsawNoon } from "./dates.ts";
import { LOCALE } from "./locale.ts";

/** Full date with year, safe to render on a static page. Example: "18 października 2026". */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(warsawNoon(iso))
    .replace(/ r\.$/, "");
}

function part(iso: string, type: string, options: Intl.DateTimeFormatOptions) {
  return (
    new Intl.DateTimeFormat(LOCALE, { timeZone: WARSAW, ...options })
      .formatToParts(warsawNoon(iso))
      .find((p) => p.type === type)?.value ?? ""
  );
}

/** Month heading. Example: "Październik 2026". */
export function monthTitle(iso: string): string {
  const month = part(iso, "month", { month: "long" });
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${iso.slice(0, 4)}`;
}

// "do niedzieli", "od poniedziałku": the weekday in the genitive, Sunday first.
const WEEKDAY_GENITIVE = [
  "niedzieli",
  "poniedziałku",
  "wtorku",
  "środy",
  "czwartku",
  "piątku",
  "soboty",
];

/** An instant's day in Warsaw, after "od"/"do". Example: "niedzieli 25 października". */
export function dayGenitive(at: number): string {
  const weekday = WEEKDAY_GENITIVE[warsawNoon(warsawDay(at)).getUTCDay()];
  return `${weekday} ${dayMonth(at)}`;
}

/** An instant's Warsaw day and month. Example: "25 października". */
function dayMonth(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    day: "numeric",
    month: "long",
  }).format(at);
}

/** An instant's Warsaw day, month and time. Example: "25 października, 14:20". */
export function dayMonthTime(at: number): string {
  return `${dayMonth(at)}, ${clockTime(at)}`;
}

/** An instant's Warsaw date. Example: "2026-10-25". */
export function warsawDay(at: number): string {
  return todayInWarsaw(new Date(at));
}

/** Warsaw clock time. Example: "7:05". */
export function clockTime(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

let moments: Intl.DateTimeFormat | undefined;

/**
 * Intl's range of two instants (Warsaw day, month and time), split at the
 * dash it puts between them, so a sentence can say „od … do …”: ["11
 * listopada, 10:00", "16:00"], ["11 listopada, 22:00", "12 listopada, 4:00"].
 */
export function momentRange(from: number, to: number): [string, string] {
  moments ??= new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = moments.formatRangeToParts(from, to);
  // The site's one "day, time" style, from Intl's parts: the hour without
  // its zero, ", " between the month and the hour.
  const join = (some: Intl.DateTimeRangeFormatPart[]) =>
    some
      .map((part, i) => {
        if (part.type === "hour") return String(Number(part.value));
        if (
          part.type === "literal" &&
          some[i - 1]?.type === "month" &&
          some[i + 1]?.type === "hour"
        )
          return ", ";
        return part.value;
      })
      .join("");
  const end = parts.findIndex((part) => part.source === "endRange");
  // The same minute: Intl gives one moment, no range.
  if (end < 0) return [join(parts), join(parts)];
  return [join(parts.slice(0, end - 1)), join(parts.slice(end))];
}
