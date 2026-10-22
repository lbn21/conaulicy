// What the street page and its PDF say about a place's dates, kept in one
// place so the two cannot drift. Pure, so the unit tests need no database.
import type { PickupDay } from "@/lib/schedule";

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
