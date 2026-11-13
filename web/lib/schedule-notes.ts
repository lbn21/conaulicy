// What the street page, its PDF and the calendar say about a place's dates,
// kept in one place so they cannot drift. Pure, so the unit tests need no
// database.
import type { PickupDay, PlaceView } from "@/lib/schedule";
import { capitalised } from "./dates.ts";
import { scheduleOwner } from "./places.ts";
import { SITE_TOPICS } from "./topics.ts";

/**
 * Whether a place has any pickup on or after `today` (a Warsaw ISO day).
 * Without one there is no PDF and no calendar file to offer, so the page
 * hides both and the PDF route answers 404.
 */
export function hasUpcoming(days: PickupDay[], today: string): boolean {
  return days.some((day) => day.date >= today);
}

/**
 * When to put the bins out, on the page, in the PDF, in the calendar and on
 * the address page: `time` is the data's hour ("06:00"), shown without its
 * leading zero; `named`: the bins were named right before („je”).
 */
export function putOutNote(time: string, named = false): string {
  return `Wystaw ${named ? "je" : "pojemniki"} do ${time.replace(/^0/, "")} w dniu odbioru.`;
}

/**
 * Who is authoritative, one sentence everywhere (t427 glossary 7):
 * „Nie jesteśmy urzędem – obowiązuje ‹what›.”
 */
export function notAnOffice(what: string, verb = "obowiązuje"): string {
  return `Nie jesteśmy urzędem – ${verb} ${what}.`;
}

/** In the footer and a calendar without its gmina. */
export const DISCLAIMER = notAnOffice(
  "harmonogramy i komunikaty urzędów",
  "obowiązują",
);

/** Whose schedule, in the genitive: the town's office, else the gmina's. */
const ownerOf = (gmina: string | null) =>
  gmina ? scheduleOwner(gmina) : "urzędu";

/** The same for one gmina's schedule (the calendar, the PDF). */
export function disclaimer(gmina: string): string {
  return notAnOffice(`harmonogram ${scheduleOwner(gmina)}`);
}

/** Dates read by a program, not yet checked: `what` is authoritative. */
export function aiReadNote(what: string, verb?: string): string {
  return `Te daty odczytaliśmy automatycznie i jeszcze ich nie sprawdziliśmy. W razie różnic ${verb ?? "obowiązuje"} ${what}.`;
}

/**
 * When the next dates come: after the gmina's next schedule, its owner
 * named; null: unnamed, where the next sentence names it.
 */
const nextSchedule = (gmina: string | null | undefined) =>
  gmina === undefined
    ? "gdy tylko pojawi się nowy harmonogram"
    : `gdy tylko pojawi się nowy harmonogram ${ownerOf(gmina)}`;

/**
 * After the last date, on the waste subpage and in its calendar:
 * the next year's dates come when published. Null without dates.
 */
export function laterNote(
  days: Pick<PickupDay, "date">[],
  gmina: string | null,
): string | null {
  return days.length > 0
    ? `Terminy na kolejny rok dodamy, ${nextSchedule(gmina)}.`
    : null;
}

/** When a place's schedule has ended: the heading, then what comes next. */
export const NO_MORE_DATES = "Nie mamy jeszcze kolejnych terminów";
/** `gmina`: whose schedule; left out where the next sentence names it. */
export const noMoreDatesNext = (gmina?: string) =>
  `Dodamy je, ${nextSchedule(gmina)}.`;

/** Shown on the page while a place is not verified. */
export function unverifiedNote(gmina: string): string {
  return aiReadNote(`harmonogram ${scheduleOwner(gmina)}`);
}

/** What the address page holds, its modules', for its description. */
const ADDRESS_TOPICS = capitalised(SITE_TOPICS);

/**
 * The place's description in search results and when shared: its dates and
 * files only when the page offers them. The label after a colon, so no place name is declined.
 * The address page's is an overview of its modules; `waste`, the waste
 * subpage's own (/adres/<id>/smieci): the full list, calendar and PDF.
 */
export function placeDescription(
  place: Pick<PlaceView, "label" | "gmina" | "zoneId" | "days" | "today">,
  page: "address" | "waste" = "address",
): string {
  const dates = place.zoneId !== null && hasUpcoming(place.days, place.today);
  if (page === "waste") {
    return dates
      ? `Pełna lista odbiorów śmieci: ${place.label}. Wszystkie terminy do kalendarza w telefonie i harmonogram do druku (PDF).`
      : `Odbiór śmieci: ${place.label}. Terminów jeszcze tu nie mamy – do tego czasu sprawdź harmonogram ${scheduleOwner(place.gmina)}.`;
  }
  return dates
    ? `${ADDRESS_TOPICS}: ${place.label}. Najbliższe terminy w jednym miejscu.`
    : `${ADDRESS_TOPICS}: ${place.label}. Terminów odbioru jeszcze tu nie mamy.`;
}

/** The printed schedule's title (the PDF's band and its metadata). */
export const PDF_TITLE = "Harmonogram odbioru śmieci";
