// The CDN keys its cache on the full URL, query included, so any parameter a
// route does not read would make a new cache entry (and a function call) per
// value. proxy.ts redirects such URLs to the clean one.

const ALLOWED: [RegExp, string[]][] = [
  [/^\/adres\/[^/]+\/?$/, ["nr"]],
  [/^\/adres\/[^/]+\/harmonogram\.pdf$/, ["nr"]],
  [/^\/api\/search$/, ["q"]],
];

// Next.js internals, Vercel's own paths, the revalidate hook (POST, its own
// secret) and well-known files are never redirected.
const UNTOUCHED = /^\/(?:_next|_vercel|\.well-known)\/|^\/api\/revalidate$/;

/**
 * The clean search string ("?nr=12a" or "") when the URL carries a parameter
 * its route does not read, or an allowed one twice; null when it is clean.
 * Keeps the first value of each allowed parameter, in allowlist order, empty
 * values included (?nr= still reaches the /numer page). Values are
 * re-encoded by URLSearchParams.
 */
export function cleanQuery(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  if (UNTOUCHED.test(pathname)) return null;
  const allowed = ALLOWED.find(([path]) => path.test(pathname))?.[1] ?? [];
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
