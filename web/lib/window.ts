// The site's one 7-day window: the read's Warsaw day and the six after
// it, for the address page's „Najbliższe 7 dni” and its module counts
// (components/timeline.tsx, components/hub.tsx) and the home page's
// „Teraz w gminie” (components/now-tiles.ts). Calendar days, so a DST
// change is still one day. Pure, so the unit tests read it.
import { addDays } from "./dates.ts";

/** The window's length, in days. */
export const WINDOW = 7;

/** Every count's words for the window: „2 w ciągu 7 dni”. */
export const IN_WINDOW = `w ciągu ${WINDOW} dni`;

/** The window: its first and last day and the day after it (ISO days). */
export type Window = { from: string; to: string; until: string };

/** The window from `today` (a Warsaw ISO day), `n` days long. */
export function windowOf(today: string, n = WINDOW): Window {
  return { from: today, to: addDays(today, n - 1), until: addDays(today, n) };
}

/** today … today+n-1, Warsaw days. */
export function days(today: string, n = WINDOW): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}
