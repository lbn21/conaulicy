// Server-only date labels for the street page and the PDF. Kept out of
// lib/dates.ts, which the client bundle imports.
import "server-only";
import { WARSAW, warsawNoon } from "@/lib/dates";
import { LOCALE } from "@/lib/locale";

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
