// Address search, shared by /api/search (server) and the search field
// (client, over the index from /api/search-index). Every place's search text
// is normalize(label), as the importer stores it in the database.

import { normalize } from "./normalize.ts";

export type SearchHit = { id: string; label: string };

/** What /api/search-index serves: [id, label] per searchable place. */
export type SearchIndex = Array<[id: string, label: string]>;

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
