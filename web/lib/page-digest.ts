import { createHash } from "node:crypto";

// A page's digest (lib/page-refresh.ts): a hash of the view it renders,
// the data its one cache scope holds (lib/page-cache.ts PageDef). Equal
// views, equal digests, whatever the order of an object's keys. Pure, so
// the unit tests read every case. Two rules make it the page's, not the
// clock's:
//
// - The clock is not in a view (pageData keeps it beside it), but a page
//   compares it with the instants its view holds (a cut that has begun, a
//   warning in force, a range over): each instant is hashed with whether
//   it has passed, so the digest changes when one does, and only then.
//   The Warsaw day is in the views that render day words (PlaceView.today,
//   the home panel's week), so a new day changes those, and only those.
// - UNHASHED keys are left out: when a source's data last changed
//   („Bez zmian od”) is one time for the whole source, so hashing it would
//   change every place's pages when one place's data changes. A page whose
//   own data did not change keeps its earlier time, still true of it.

/** Keys never hashed (see above). */
const UNHASHED = new Set(["changedAt"]);

/** An instant: an ISO date with a time ("2026-11-14T08:00:00+01:00"). */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** The value as hashed: keys sorted, UNHASHED and undefined left out. */
function hashed(value: unknown, now: number): unknown {
  if (Array.isArray(value)) return value.map((v) => hashed(v, now));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .filter(
          (key) =>
            !UNHASHED.has(key) &&
            (value as Record<string, unknown>)[key] !== undefined,
        )
        .sort()
        .map((key) => [
          key,
          hashed((value as Record<string, unknown>)[key], now),
        ]),
    );
  if (typeof value === "string" && INSTANT.test(value)) {
    const at = Date.parse(value);
    if (!Number.isNaN(at)) return [value, at <= now];
  }
  return value;
}

/** The digest of a view rendered at `now` (ms). */
export function digestOf(view: unknown, now: number): string {
  return createHash("sha256")
    .update(JSON.stringify(hashed(view, now) ?? null))
    .digest("base64url")
    .slice(0, 16);
}
