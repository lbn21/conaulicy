// Server-only date labels for the street page, the PDF and the IMGW banner.
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

/** Short weekday without the dot. Example: "czw". */
export function weekdayShort(iso: string): string {
  return part(iso, "weekday", { weekday: "short" }).replace(".", "");
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
export function dayMonth(at: number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    day: "numeric",
    month: "long",
  }).format(at);
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
