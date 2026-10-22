// What the street page and its PDF say about a place's dates, kept in one
// place so the two cannot drift. Pure, so the unit tests need no database.
import type { PickupDay, PlaceView } from "@/lib/schedule";

/**
 * Whether a place has any pickup on or after `today` (a Warsaw ISO day).
 * Without one there is no PDF and no calendar file to offer, so the page
 * hides both and the PDF route answers 404.
 */
export function hasUpcoming(days: PickupDay[], today: string): boolean {
  return days.some((day) => day.date >= today);
}

/** Shown on the page and printed in the PDF while a place is not verified. */
export const UNVERIFIED_NOTE =
  "Te daty odczytaliśmy automatycznie z harmonogramu gminy i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma harmonogram gminy.";

/**
 * The place's description in search results and when shared: its dates and
 * files only when the page offers them (a split street offers them once the
 * house number is in). The label after a colon, so no place name is declined.
 */
export function placeDescription(
  place: Pick<PlaceView, "label" | "zoneId" | "askNumber" | "days" | "today">,
): string {
  return place.zoneId !== null &&
    (place.askNumber || hasUpcoming(place.days, place.today))
    ? `Terminy wywozu śmieci: ${place.label}. Dodaj je do kalendarza w telefonie albo pobierz harmonogram do wydruku.`
    : `Wywóz śmieci: ${place.label}. Terminów jeszcze tu nie mamy – do tego czasu sprawdź harmonogram gminy.`;
}
