// The CDN keys its cache on the full URL, query included, so any parameter a
// route does not read would make a new cache entry (and a function call) per
// value. proxy.ts redirects such URLs on the cacheable routes below to the
// clean one. Every other path (files, Next.js metadata and internals, Vercel's
// own paths, the revalidate hook, unknown paths) is never touched: Next.js
// links its icons with a cache-busting query.

const ROUTES: [RegExp, string[]][] = [
  [/^\/(?:ulice|dostepnosc|prywatnosc|o-projekcie)?$/, []],
  [/^\/szukaj$/, ["q"]],
  [/^\/adres\/[^/]+\/?$/, ["nr"]],
  [/^\/adres\/[^/]+\/nr(?:\/[^/]+)+$/, []],
  [/^\/adres\/[^/]+\/numer$/, []],
  [/^\/adres\/[^/]+\/harmonogram\.pdf$/, ["nr"]],
  [/^\/ics\/[^/]+$/, []],
  [/^\/api\/search$/, ["q"]],
  [/^\/api\/search-index\/[^/]+$/, []],
];

/**
 * The clean search string ("?nr=12a" or "") when the URL carries a parameter
 * its route does not read, or an allowed one twice; null when it is clean or
 * the path is not one of the routes above.
 * Keeps the first value of each allowed parameter, in allowlist order, empty
 * values included (?nr= still reaches the /numer page). Values are
 * re-encoded by URLSearchParams.
 */
export function cleanQuery(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const allowed = ROUTES.find(([path]) => path.test(pathname))?.[1];
  if (!allowed) return null;
  const keys = [...searchParams.keys()];
  const clean = keys.every(
    (key) => allowed.includes(key) && searchParams.getAll(key).length === 1,
  );
  if (clean) return null;
  const kept = new URLSearchParams();
  for (const key of allowed) {
    const value = searchParams.get(key);
    if (value !== null) kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `?${search}` : "";
}
