// The search index in the browser (/search-index.json, one static file),
// fetched at most once per page and URL (one retry) and shared by the
// search field's
// suggestions and „Szukaj” (components/address-search.tsx). One promise per
// URL; once in, also read as it is (loadedIndex), so „Szukaj” never waits
// for it again. Client-safe.
import { type Matcher, matcher, type SearchIndex } from "./search.ts";

export type LoadedIndex = { places: SearchIndex; match: Matcher };

const loading = new Map<string, Promise<LoadedIndex>>();
const loaded = new Map<string, LoadedIndex>();

async function fetchIndex(url: string): Promise<SearchIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as SearchIndex;
}

/**
 * The index at `url` and its matcher, tried twice; rejects when it cannot
 * load.
 */
export function loadIndex(url: string): Promise<LoadedIndex> {
  let promise = loading.get(url);
  if (!promise) {
    promise = fetchIndex(url)
      .catch(() => fetchIndex(url))
      .then((places) => {
        const index = { places, match: matcher(places) };
        loaded.set(url, index);
        return index;
      });
    // A failed load may be tried again (the next search).
    promise.catch(() => loading.delete(url));
    loading.set(url, promise);
  }
  return promise;
}

/** The index at `url` if it has loaded on this page, else null. */
export function loadedIndex(url: string): LoadedIndex | null {
  return loaded.get(url) ?? null;
}
