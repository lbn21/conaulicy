// House numbers: peeled off a search query ("Asnyka 12", "12 Asnyka"),
// carried as ?nr=12a, and matched against a zone member's range
// (houseFrom/houseTo/parity in zone_members). Pure functions, shared by the
// search field, /api/search and the street page.

// "12", "12a", "7/22", "12/14": a building number, an optional letter, and an
// optional second part (flat or double number). Up to 4 digits each.
const HOUSE_NUMBER = /^(\d{1,4})([a-z]?)(?:\/(\d{1,4})([a-z]?))?$/;

/** "12A" → "12a"; anything else that is not a house number → null. */
export function houseNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const nr = raw.trim().toLowerCase().replace(/\s+/g, "");
  return HOUSE_NUMBER.test(nr) ? nr : null;
}

export type Reading = { text: string; nr: string | null };

/**
 * Ways to read a query, best first: a trailing number ("Asnyka 12"), the
 * query as typed (street names with digits: "3 Maja"), a leading number
 * ("12 Asnyka"). Search takes the first reading that finds a place.
 */
export function readings(q: string): Reading[] {
  const words = q.trim().split(/\s+/).filter(Boolean);
  const result: Reading[] = [];
  if (words.length > 1) {
    const last = houseNumber(words.at(-1));
    if (last) result.push({ text: words.slice(0, -1).join(" "), nr: last });
  }
  result.push({ text: words.join(" "), nr: null });
  if (words.length > 1) {
    const first = houseNumber(words[0]);
    if (first) result.push({ text: words.slice(1).join(" "), nr: first });
  }
  return result;
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
