// What „Szukaj” finds (components/address-search.tsx), over the index in
// the browser (lib/search-index.ts): one clearly best place, whose page it
// opens; several, listed under the field; or none. Client-safe.
import {
  exactPlace,
  MAX_QUERY_LENGTH,
  type Matcher,
  placeHref,
  type SearchHit,
  type SearchIndex,
} from "./search.ts";

export type Outcome =
  | { kind: "none"; q: string }
  | { kind: "one"; hit: SearchHit }
  | { kind: "many"; q: string; hits: SearchHit[] };

type Index = { places: SearchIndex; match: Matcher };

/** The query as the search reads it: trimmed, spaces folded, cut to length. */
export const searchQuery = (raw: string | null) =>
  (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);

/**
 * What the index finds for a query (searchQuery's, not empty): the place
 * whose suggestion text it is (a pick), else one clearly best place, else
 * every place found, ranked.
 */
export function outcomeOf({ places, match }: Index, q: string): Outcome {
  const exact = exactPlace(places, q);
  if (exact) return { kind: "one", hit: exact };
  const found = match(q, Number.POSITIVE_INFINITY);
  if (found.clear && found.hits.length > 0)
    return { kind: "one", hit: found.hits[0] };
  return found.hits.length === 0
    ? { kind: "none", q }
    : { kind: "many", q, hits: found.hits };
}

/** The one place's page for a query (with its house number), or null. */
export function placeTarget(index: Index, q: string): string | null {
  const outcome = outcomeOf(index, q);
  return outcome.kind === "one" ? placeHref(outcome.hit) : null;
}
