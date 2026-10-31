import "server-only";
import { PRG_NUMBERS } from "./prg-numbers.generated.ts";
import type { PlaceView } from "./schedule.ts";

// The typed house number checked against the national address register
// (PRG, GUGiK; npm run prg:update): a number it lacks is set aside, and
// the page shows the whole place with a warning.
// Server only: the numbers never reach the browser (scripts/check-bundle.mjs).

const NUMBERS = new Map(
  PRG_NUMBERS.trim()
    .split("\n")
    .map((line) => {
      const [id, list] = line.split(";");
      return [id, new Set(list.split(","))] as const;
    }),
);

/**
 * The one check of a house number (task 205), for every page and file that
 * takes one (lib/schedule.ts getPlace): the value, trimmed and upper case,
 * is one of the register's numbers at the place, or a flat ("7/22") whose
 * building ("7") is. null: the register has no point at the place, so
 * nothing is checked.
 */
export function isValidHouseNumber(
  place: string,
  value: string,
): boolean | null {
  const numbers = NUMBERS.get(place);
  if (!numbers) return null;
  const nr = value.trim().toUpperCase();
  const slash = nr.indexOf("/");
  return numbers.has(nr) || (slash > 0 && numbers.has(nr.slice(0, slash)));
}

/** The register's first house number at the place, or null: none. */
export function firstHouseNumber(place: string): string | null {
  return NUMBERS.get(place)?.values().next().value ?? null;
}

/**
 * Under the h1 for a number the register does not have (invalidNr): one
 * warning, the value as given. A street keeps its own word, as before.
 * None on a split street still asking for the number: its error says it.
 */
export function numberWarning(
  place: Pick<PlaceView, "kind" | "invalidNr" | "askNumber">,
): string | null {
  if (place.invalidNr === null || place.askNumber) return null;
  const whole = place.kind === "ulica" ? "całą ulicę" : "całą miejscowość";
  return `Nie znaleźliśmy nr „${place.invalidNr}” pod tym adresem – pokazujemy ${whole}.`;
}
