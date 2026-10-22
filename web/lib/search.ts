// Address search, shared by /api/search (server) and the search field
// (client, over the index from /api/search-index). Every place's search text
// is normalize(label), as the importer stores it in the database.

import { readings } from "./house.ts";
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

/** Normalizes every label once; the matcher then runs on each keystroke. */
export function matcher(index: SearchIndex): Matcher {
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
          .slice(0, SEARCH_LIMIT);
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

/** Where a hit links to: the place, and its house number if given. */
export function placeHref(hit: SearchHit): string {
  const path = `/adres/${encodeURIComponent(hit.id)}`;
  // A valid number is only digits, a-z and "/", all fine in a query.
  return hit.nr ? `${path}?nr=${hit.nr}` : path;
}
