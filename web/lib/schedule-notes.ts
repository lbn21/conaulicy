// What the street page, its PDF and the calendar say about a place's dates,
// kept in one place so they cannot drift. Pure, so the unit tests need no
// database.
import type { PickupDay, PlaceView } from "@/lib/schedule";
import { scheduleOwner } from "./places.ts";

/**
 * Whether a place has any pickup on or after `today` (a Warsaw ISO day).
 * Without one there is no PDF and no calendar file to offer, so the page
 * hides both and the PDF route answers 404.
 */
export function hasUpcoming(days: PickupDay[], today: string): boolean {
  return days.some((day) => day.date >= today);
}

/**
 * When to put the bins out, on the page, in the PDF and in the calendar:
 * `time` is the data's hour ("06:00"), shown without its leading zero.
 */
export function putOutNote(time: string): string {
  return `Wystaw pojemniki ${putOutBy(time)}.`;
}

/** The same, after „Wystaw”: "do 6:00 w dniu odbioru". */
export function putOutBy(time: string): string {
  return `do ${time.replace(/^0/, "")} w dniu odbioru`;
}

/** In the footer, the calendar and the PDF: we are not the gmina. */
export const DISCLAIMER =
  "Nie jesteśmy urzędem – obowiązuje harmonogram gminy.";

/** The same for one gmina's schedule (the calendar, the PDF). */
export function disclaimer(gmina: string): string {
  return `Nie jesteśmy urzędem – obowiązuje harmonogram ${scheduleOwner(gmina)}.`;
}

/**
 * After the last date, on the waste subpage and in its calendar: the next
 * year's dates come when published. Null without dates.
 */
export function laterNote(days: Pick<PickupDay, "date">[]): string | null {
  const last = days.at(-1);
  if (!last) return null;
  return `Terminy na ${Number(last.date.slice(0, 4)) + 1} dodamy, gdy je ogłoszą.`;
}

/**
 * Under the h1 of the address page and the waste subpage: a house number
 * given on a street not split by numbers changes nothing, so say so. Null on
 * a split street (the number picks the part, or the page asks again), on a
 * village, and where we have no dates. A number the register lacks is no
 * givenNr (lib/prg.ts numberWarning says it instead).
 */
export function sharedNumberNote(
  place: Pick<PlaceView, "kind" | "zoneId" | "nr" | "askNumber" | "givenNr">,
): string | null {
  if (!place.givenNr || place.nr || place.askNumber) return null;
  if (place.kind !== "ulica" || place.zoneId === null) return null;
  return `Harmonogram jest wspólny dla całej ulicy, także dla nr ${place.givenNr}.`;
}

/**
 * The number after the place's name (h1, title, caption, breadcrumb): one
 * the register has there, or the one that picks a split street's part;
 * else none.
 */
export function shownNr(
  place: Pick<PlaceView, "nr" | "givenNr" | "knownNr">,
): string | null {
  return place.knownNr ? place.givenNr : place.nr;
}

/** When a place's schedule has ended: the heading, then what comes next. */
export const NO_MORE_DATES = "Nie mamy jeszcze kolejnych terminów";
export const NO_MORE_DATES_NEXT =
  "Dodamy je, gdy tylko gmina ogłosi nowy harmonogram.";

/** Shown on the page and printed in the PDF while a place is not verified. */
export function unverifiedNote(gmina: string): string {
  return `Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest harmonogram ${scheduleOwner(gmina)}.`;
}

/**
 * The place's description in search results and when shared: its dates and
 * files only when the page offers them (a split street offers them once the
 * house number is in). The label after a colon, so no place name is declined.
 * The address page's is an overview of its modules; `waste`, the waste
 * subpage's own (/adres/<id>/smieci): the full list, calendar and PDF.
 */
export function placeDescription(
  place: Pick<
    PlaceView,
    "label" | "gmina" | "zoneId" | "askNumber" | "days" | "today"
  >,
  page: "address" | "waste" = "address",
): string {
  const dates =
    place.zoneId !== null &&
    (place.askNumber || hasUpcoming(place.days, place.today));
  if (page === "waste") {
    return dates
      ? `Pełna lista odbiorów śmieci: ${place.label}. Wszystkie terminy do kalendarza w telefonie i harmonogram do druku (PDF).`
      : `Odbiór śmieci: ${place.label}. Terminów jeszcze tu nie mamy – do tego czasu sprawdź harmonogram ${scheduleOwner(place.gmina)}.`;
  }
  return dates
    ? `Wywóz śmieci, przerwy w dostawie wody i ostrzeżenia IMGW: ${place.label}. Najbliższe terminy w jednym miejscu.`
    : `Wywóz śmieci, przerwy w dostawie wody i ostrzeżenia IMGW: ${place.label}. Terminów wywozu jeszcze tu nie mamy.`;
}
