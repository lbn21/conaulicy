// The search index in the browser (/api/search-index/<version>, immutable),
// fetched at most once per page and URL and shared by the search field
// (components/address-search.tsx) and /szukaj's results
// (components/search-results.tsx). One promise per URL, created outside
// render and reused, as React's use() requires
// (react.dev/reference/react/use, "Caching Promises for Client
// Components"). Client-safe.
import { type Matcher, matcher, type SearchIndex } from "./search.ts";

export type LoadedIndex = { places: SearchIndex; match: Matcher };

const loaded = new Map<string, Promise<LoadedIndex>>();

/** The index at `url` and its matcher; rejects when it cannot load. */
export function loadIndex(url: string): Promise<LoadedIndex> {
  let promise = loaded.get(url);
  if (!promise) {
    promise = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const places = (await res.json()) as SearchIndex;
      return { places, match: matcher(places) };
    });
    // A failed load may be tried again (the next search).
    promise.catch(() => loaded.delete(url));
    loaded.set(url, promise);
  }
  return promise;
}
