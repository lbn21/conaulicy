import "server-only";
import { prgNumber } from "./house.ts";
import { PRG_NUMBERS } from "./prg-numbers.generated.ts";
import type { PlaceView } from "./schedule.ts";

// The typed house number checked against the national address register
// (PRG, GUGiK; npm run prg:update): a hint under the h1, never a filter.
// Server only: the numbers never reach the browser (scripts/check-bundle.mjs).

export type PrgMatch = "found" | "not-found" | "unknown";

const NUMBERS = new Map(
  PRG_NUMBERS.trim()
    .split("\n")
    .map((line) => {
      const [id, list] = line.split(";");
      return [id, new Set(list.split(","))] as const;
    }),
);

/**
 * Whether PRG has nr at the place: the number itself, or for a flat
 * ("7/22") its building ("7"). "unknown": PRG has no point there at all.
 */
export function prgMatch(
  numbers: ReadonlySet<string> | undefined,
  nr: string,
): PrgMatch {
  if (!numbers) return "unknown";
  const typed = prgNumber(nr);
  if (!typed) return "not-found";
  if (numbers.has(typed)) return "found";
  const slash = typed.indexOf("/");
  return slash > 0 && numbers.has(typed.slice(0, slash))
    ? "found"
    : "not-found";
}

/**
 * The note for a number PRG does not have at the place, or null. None on a
 * split street still asking for the number: its own error says it.
 */
export function prgNote(
  place: Pick<PlaceView, "id" | "kind" | "givenNr" | "askNumber">,
): string | null {
  if (!place.givenNr || place.askNumber) return null;
  if (prgMatch(NUMBERS.get(place.id), place.givenNr) !== "not-found") {
    return null;
  }
  const where =
    place.kind === "ulica" ? "przy tej ulicy" : "w tej miejscowości";
  return `Nie znaleźliśmy nr ${place.givenNr} ${where} w rejestrze adresów. Sprawdź, czy numer jest dobry.`;
}
