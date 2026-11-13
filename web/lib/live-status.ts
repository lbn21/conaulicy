import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";

// When each source was last checked: status/checks.json in the private Blob
// store (lib/live-store.ts), by the ZUK cron at the end of a run
// (lib/zuk-cron.ts handleZukCron, the one writer). One shape for every
// source key: the last good check, the try the file was written at, and
// whether the source's last try went well. Pure, so the unit tests read
// every state. docs/data/imgw.md.
//
// Written only when a page could show the difference (checksWorth), as a
// Blob write is a paid operation: a source's state flips (good, failing),
// or a source checked well has a stored check CHECK_REFRESH_MS old. So a
// source checked well never reads as stale, and a failing one turns stale
// and too old when it did with a write every run, to a run (nextChecks).

/** Raise it when the shape changes: a file of another version is not read. */
export const CHECKS_VERSION = 1;

/** Older than this, the data may be out of date: say so. */
export const STALE_MS = 60 * 60_000;

/** Older than this, the data is not shown at all (only that it is old). */
export const MAX_AGE_MS = 3 * 3_600_000;

/** The cron's period (vercel.json: 7,22,37,52 * * * *). */
export const CHECK_EVERY_MS = 15 * 60_000;

/**
 * A good check is written again once the stored one is this old: the
 * third run after a write (45 min, however late a run starts), so the
 * oldest stored check a page can read is 45 min and a run's length (at
 * most maxDuration, 5 min) old: under STALE_MS.
 */
const CHECK_REFRESH_MS = 40 * 60_000;

/**
 * How far a stored good check may lag the cron's last good run while the
 * cron is healthy (checksWorth writes none in between): what a reader
 * that adds a margin to a check time must allow for (lib/power-module.ts).
 */
export const CHECK_LAG_MS = CHECK_REFRESH_MS + CHECK_EVERY_MS;

/** IMGW's warnings feed (lib/imgw-cron.ts). */
export const IMGW_KEY = "imgw";

/** PGE Dystrybucja's power outages (lib/pge-cron.ts). */
export const PGE_KEY = "pge";

/** A water source's posts (lib/sources, its id). */
export const waterKey = (id: string) => `water:${id}`;

type SourceCheck = {
  /** ISO: the last good check; null: none yet. */
  checkedAt: string | null;
  /** ISO: the try the file was written at. */
  attemptAt: string;
  ok: boolean;
};

export type Checks = {
  version: typeof CHECKS_VERSION;
  sources: Record<string, SourceCheck>;
};

const isTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function isCheck(value: unknown): value is SourceCheck {
  if (!value || typeof value !== "object") return false;
  const { checkedAt, attemptAt, ok } = value as Record<string, unknown>;
  return (
    (checkedAt === null || isTime(checkedAt)) &&
    isTime(attemptAt) &&
    typeof ok === "boolean"
  );
}

/** The file, or null: none, not JSON, another version or another shape. */
export function parseChecks(body: string | null): Checks | null {
  if (body === null) return null;
  let file: unknown;
  try {
    file = JSON.parse(body);
  } catch {
    return null;
  }
  if (!file || typeof file !== "object") return null;
  const { version, sources } = file as Record<string, unknown>;
  if (version !== CHECKS_VERSION || !sources || typeof sources !== "object")
    return null;
  if (!Object.values(sources).every(isCheck)) return null;
  return { version, sources: sources as Record<string, SourceCheck> };
}

/**
 * The last good check of a source failing at `attemptAt` (ms), from its
 * stored entry. Failing before: its stored check. Good before: the runs
 * since the stored check went well (checksWorth wrote none of them, as it
 * writes every flip), the last of them one period ago; a gap a good run
 * would have written in (CHECK_LAG_MS: runs missing, the cron down) keeps
 * the stored check, never a later guess.
 */
function lastGood(stored: SourceCheck | undefined, attemptAt: number) {
  if (!stored?.checkedAt) return null;
  const checked = Date.parse(stored.checkedAt);
  if (!stored.ok || attemptAt - checked >= CHECK_LAG_MS)
    return stored.checkedAt;
  return new Date(Math.max(checked, attemptAt - CHECK_EVERY_MS)).toISOString();
}

/**
 * After a run: each source tried (`results`, its key and whether it went
 * well) at `attemptAt`; a good try is its new check, a failed one keeps the
 * last good (lastGood). Sources not tried this run stay as they were.
 */
export function nextChecks(
  previous: Checks | null,
  results: Record<string, boolean>,
  attemptAt: string,
): Checks {
  const sources = { ...previous?.sources };
  const at = Date.parse(attemptAt);
  for (const [key, ok] of Object.entries(results))
    sources[key] = {
      checkedAt: ok ? attemptAt : lastGood(sources[key], at),
      attemptAt,
      ok,
    };
  return { version: CHECKS_VERSION, sources };
}

/**
 * Whether `next` is worth writing over `previous` (see above): no file, a
 * source new or flipped, or a good one whose stored check is
 * CHECK_REFRESH_MS old.
 */
export function checksWorth(previous: Checks | null, next: Checks): boolean {
  if (!previous) return true;
  return Object.entries(next.sources).some(([key, now]) => {
    const before = previous.sources[key];
    if (!before || before.ok !== now.ok) return true;
    if (!now.ok || !now.checkedAt) return false;
    return (
      !before.checkedAt ||
      Date.parse(now.checkedAt) - Date.parse(before.checkedAt) >=
        CHECK_REFRESH_MS
    );
  });
}

/**
 * The oldest last good check of `keys` (ms), or null when any of them has
 * none: a line about several sources is as old as its oldest.
 */
export function oldestCheck(
  checks: Checks | null,
  keys: string[],
): number | null {
  if (keys.length === 0) return null;
  let oldest = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const checkedAt = checks?.sources[key]?.checkedAt;
    if (!checkedAt) return null;
    oldest = Math.min(oldest, Date.parse(checkedAt));
  }
  return oldest;
}

/**
 * How old a last good check is: stale over STALE_MS (as the water's,
 * lib/zuk-data.ts zukView), too old from MAX_AGE_MS.
 */
export function checkAge(
  checkedAt: number,
  now: number,
): "fresh" | "stale" | "too-old" {
  const age = now - checkedAt;
  if (age >= MAX_AGE_MS) return "too-old";
  return age > STALE_MS ? "stale" : "fresh";
}

/**
 * What the pages read of a live feed (lib/live-store.ts): its last good
 * copy, null when the cron has written none yet, or UNREADABLE when the
 * store could not be read now: an expected error, returned as a value.
 */
export const UNREADABLE = "unreadable";

/**
 * A feed's last good copy, when it was last checked well (ms), and when
 * its items last changed (ms): the file is written only when they do
 * (lib/live-cron.ts), so its fetchedAt is that run's, and doubles as the
 * run's id (lib/live-runs.ts).
 */
export type LiveCopy<F> = { feed: F; checkedAt: number; changedAt: number };

/**
 * The copy of a feed file (`feed`, parsed; null: no file yet) and the
 * status file's body: the last good check is the status file's `key`
 * (every good run), never older than the feed file's own time (the feed
 * is written only when it changed).
 */
export function liveCopyOf<F extends { fetchedAt: string }>(
  feed: F | null,
  checksBody: string | null,
  key: string,
): LiveCopy<F> | null {
  if (!feed) return null;
  const fetchedAt = Date.parse(feed.fetchedAt);
  const checked = oldestCheck(parseChecks(checksBody), [key]);
  return {
    feed,
    checkedAt: Math.max(checked ?? fetchedAt, fetchedAt),
    changedAt: fetchedAt,
  };
}

/** "9:52" today, else "piątku 30 października, 9:52": when the last data is from. */
function since(time: number, now: number): string {
  return warsawDay(time) === warsawDay(now)
    ? clockTime(time)
    : `${dayGenitive(time)}, ${clockTime(time)}`;
}

/**
 * A live feed's notice by the age of its last good check (checkAge): none
 * while fresh; stale, when the last data is from (`shown` of it still
 * listed, or none); too old, only that it is not shown. `what` is the
 * genitive after „pobrać”: „ostrzeżeń IMGW”.
 */
export function liveNotice(
  what: string,
  checkedAt: number,
  now: number,
  shown: number,
): string | null {
  const age = checkAge(checkedAt, now);
  const time = since(checkedAt, now);
  if (age === "fresh") return null;
  if (age === "too-old")
    return `Od ${time} nie udało się nam pobrać ${what}, więc ich nie pokazujemy.`;
  return shown > 0
    ? `Nie udało się teraz pobrać ${what}. Pokazujemy ostatnie dane z ${time}.`
    : `Nie udało się teraz pobrać ${what}. Ostatnie dane mamy z ${time}.`;
}
