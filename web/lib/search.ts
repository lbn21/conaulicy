// Address search, shared by /api/search (server) and the search field
// (client, over the index from /api/search-index). Every place's search text
// is normalize(label), as the importer stores it in the database.

import { houseNumber, readings, withHouseNumber } from "./house.ts";
import { normalize } from "./normalize.ts";

export type SearchHit = {
  id: string;
  label: string;
  /** House number read from the query ("Asnyka 12"), for ?nr=. */
  nr?: string | null;
};

/** What /api/search-index serves: [id, label] per searchable place. */
export type SearchIndex = Array<[id: string, label: string]>;

/** Id of the home page's search element. */
export const SEARCH_ID = "szukaj";

/** At most this many places in the list. */
export const SEARCH_LIMIT = 8;

// "ul. Asnyka" and "ulica Asnyka" find the same street.
const IGNORED_TERMS = new Set(["ul", "ulica"]);

/** The words to match; none when q is empty or only "ul." / "ulica". */
export function searchTerms(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((term) => term && !IGNORED_TERMS.has(term));
}

export function byLabel(a: SearchHit, b: SearchHit): number {
  return a.label.localeCompare(b.label, "pl");
}

export type Matcher = (terms: string[]) => SearchHit[];

/**
 * Normalizes every label once; the matcher then runs on each keystroke. At
 * most `limit` places: the search field lists 8, /szukaj every one.
 */
export function matcher(
  index: SearchIndex,
  limit: number = SEARCH_LIMIT,
): Matcher {
  const places = index.map(([id, label]) => ({
    hit: { id, label },
    search: normalize(label),
  }));
  return (terms) =>
    terms.length === 0
      ? []
      : places
          .filter(({ search }) => terms.every((term) => search.includes(term)))
          .map(({ hit }) => hit)
          .sort(byLabel)
          .slice(0, limit);
}

/**
 * Places for q, with the house number if it has one: the first reading of q
 * (lib/house.ts) that finds anything.
 */
export function findPlaces(match: Matcher, q: string): SearchHit[] {
  for (const { text, nr } of readings(q)) {
    const hits = match(searchTerms(text));
    if (hits.length > 0) return nr ? hits.map((hit) => ({ ...hit, nr })) : hits;
  }
  return [];
}

/**
 * The place whose suggestion text q is (the field holds it after a pick):
 * its label, or its label with a house number, where the field puts one
 * ("ul. Adama Asnyka 12, Lubaczów") or typed after it ("ul. Adama Asnyka,
 * Lubaczów 12"), compared as search compares (case, Polish letters,
 * punctuation, spaces). Null when no label, or more than one, reads so:
 * then the search proper decides.
 */
export function exactPlace(index: SearchIndex, q: string): SearchHit | null {
  const wanted = normalize(q);
  const numbers = new Set(
    // Words as the label separates them: "Asnyka 12, Lubaczów".
    q.split(/[\s,()]+/).flatMap((word) => houseNumber(word) ?? []),
  );
  for (const nr of [null, ...numbers]) {
    const found = index.filter(
      ([, label]) =>
        normalize(withHouseNumber(label, nr)) === wanted ||
        (nr !== null && normalize(`${label} ${nr}`) === wanted),
    );
    if (found.length === 1) {
      const [[id, label]] = found;
      return nr ? { id, label, nr } : { id, label };
    }
    if (found.length > 1) return null;
  }
  return null;
}

/** Where a hit links to: the place, and its house number if given. */
export function placeHref(hit: SearchHit): string {
  const path = `/adres/${encodeURIComponent(hit.id)}`;
  // A valid number is only digits, a-z and "/", all fine in a query.
  return hit.nr ? `${path}?nr=${hit.nr}` : path;
}

/** "1 adres", "3 adresy", "5 adresów", "22 adresy". */
export function addresses(n: number): string {
  if (n === 1) return "1 adres";
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${n} adresy`;
  return `${n} adresów`;
}
