// What the street page, its PDF and the calendar say about a place's dates,
// kept in one place so they cannot drift. Pure, so the unit tests need no
// database.
import type { PickupDay, PlaceView } from "@/lib/schedule";

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

/** When a place's schedule has ended: the heading, then what comes next. */
export const NO_MORE_DATES = "Nie mamy jeszcze kolejnych terminów";
export const NO_MORE_DATES_NEXT =
  "Dodamy je, gdy tylko gmina ogłosi nowy harmonogram.";

/** Shown on the page and printed in the PDF while a place is not verified. */
export const UNVERIFIED_NOTE =
  "Te daty odczytaliśmy automatycznie z harmonogramu gminy i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma harmonogram gminy.";

/**
 * The place's description in search results and when shared: its dates and
 * files only when the page offers them (a split street offers them once the
 * house number is in). The label after a colon, so no place name is declined.
 * `waste`: the waste subpage's own (/adres/<id>/smieci), every date.
 */
export function placeDescription(
  place: Pick<PlaceView, "label" | "zoneId" | "askNumber" | "days" | "today">,
  page: "address" | "waste" = "address",
): string {
  const dates =
    place.zoneId !== null &&
    (place.askNumber || hasUpcoming(place.days, place.today));
  if (page === "waste") {
    return dates
      ? `Wszystkie terminy wywozu śmieci: ${place.label}. Dodaj je do kalendarza albo pobierz harmonogram do wydruku.`
      : `Odbiór śmieci: ${place.label}. Terminów jeszcze tu nie mamy – do tego czasu sprawdź harmonogram gminy.`;
  }
  return dates
    ? `Terminy wywozu śmieci: ${place.label}. Dodaj je do kalendarza w telefonie albo pobierz harmonogram do wydruku.`
    : `Wywóz śmieci: ${place.label}. Terminów jeszcze tu nie mamy – do tego czasu sprawdź harmonogram gminy.`;
}
