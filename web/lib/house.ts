// House numbers: peeled off a search query (lib/search.ts readings),
// carried as ?nr=12a, and matched against a zone member's range
// (houseFrom/houseTo/parity in zone_members). Pure functions, shared by the
// search field, /api/search and the street page.

// "12", "12a", "7/22", "12/14": a building number, an optional letter, and an
// optional second part (flat or double number). Up to 4 digits each.
const HOUSE_NUMBER = /^(\d{1,4})([a-z]?)(?:\/(\d{1,4})([a-z]?))?$/;

/**
 * The same shape in a ?nr= query (either letter case), as a regex source:
 * next.config.ts rewrites it to the cached /adres/[id]/nr/… page, and
 * proxy.ts sends any other ?nr= (empty included) to /adres/[id]/numer.
 */
export const NR_QUERY = "\\d{1,4}[a-zA-Z]?(?:/\\d{1,4}[a-zA-Z]?)?";

/** "12A" → "12a"; anything else that is not a house number → null. */
export function houseNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const nr = raw.trim().toLowerCase().replace(/\s+/g, "");
  return HOUSE_NUMBER.test(nr) ? nr : null;
}

/** "ul. Adama Asnyka, Lubaczów" + "12" → "ul. Adama Asnyka 12, Lubaczów". */
export function withHouseNumber(label: string, nr: string | null): string {
  if (!nr) return label;
  for (const separator of [" (", ", "]) {
    const at = label.indexOf(separator);
    if (at > 0) return `${label.slice(0, at)} ${nr}${label.slice(at)}`;
  }
  return `${label} ${nr}`;
}

export type HouseRange = {
  houseFrom: string | null;
  houseTo: string | null;
  parity: "even" | "odd" | null;
};

/** A member that covers only part of its street. */
export function isPartial(range: HouseRange): boolean {
  return (
    range.houseFrom !== null || range.houseTo !== null || range.parity !== null
  );
}

// The building: its number and letter ("12a" → [12, "a"]). In "7/22" the
// building is 7; in "12/14" (a double number) the first part decides.
function building(nr: string): [number, string] | null {
  const match = HOUSE_NUMBER.exec(nr);
  return match ? [Number(match[1]), match[2]] : null;
}

function compare(a: [number, string], b: [number, string]): number {
  return a[0] - b[0] || a[1].localeCompare(b[1]);
}

/** Whether nr falls in the range: from ≤ nr ≤ to (letters after digits), parity. */
export function inRange(nr: string, range: HouseRange): boolean {
  const house = building(nr);
  if (!house) return false;
  if (range.parity && (house[0] % 2 === 0) !== (range.parity === "even")) {
    return false;
  }
  const from = range.houseFrom ? building(range.houseFrom) : null;
  const to = range.houseTo ? building(range.houseTo) : null;
  if (range.houseFrom && !from) return false;
  if (range.houseTo && !to) return false;
  if (from && compare(house, from) < 0) return false;
  if (to && compare(house, to) > 0) return false;
  return true;
}

/**
 * A house number as the address register (PRG, lib/prg.ts) writes it:
 * trimmed, letters upper case ("10a" → "10A"), a slash form kept
 * ("116/1-3"); empty → null.
 */
export function prgNumber(raw: string): string | null {
  return raw.trim().toUpperCase() || null;
}
