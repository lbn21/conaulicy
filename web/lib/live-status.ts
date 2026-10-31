// When each source was last checked: status/checks.json in the private Blob
// store (lib/live-store.ts), written by the ZUK cron once at the end of
// every run (lib/zuk-cron.ts handleZukCron, the one writer). One shape for
// every source key: the last good check, the last try, and whether that
// try went well. Pure, so the unit tests read every state. docs/data/imgw.md.

/** Raise it when the shape changes: a file of another version is not read. */
export const CHECKS_VERSION = 1;

/** Older than this, the data may be out of date: say so. */
export const STALE_MS = 60 * 60_000;

/** Older than this, the data is not shown at all (only that it is old). */
export const MAX_AGE_MS = 3 * 3_600_000;

/** IMGW's warnings feed (lib/imgw-cron.ts). */
export const IMGW_KEY = "imgw";

/** A water source's posts (lib/sources, its id). */
export const waterKey = (id: string) => `water:${id}`;

type SourceCheck = {
  /** ISO: the last good check; null: none yet. */
  checkedAt: string | null;
  /** ISO: the last try, good or not. */
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
 * After a run: each source tried (`results`, its key and whether it went
 * well) at `attemptAt`; a good try is its new check, a failed one keeps the
 * last good. Sources not tried this run stay as they were.
 */
export function nextChecks(
  previous: Checks | null,
  results: Record<string, boolean>,
  attemptAt: string,
): Checks {
  const sources = { ...previous?.sources };
  for (const [key, ok] of Object.entries(results))
    sources[key] = {
      checkedAt: ok ? attemptAt : (sources[key]?.checkedAt ?? null),
      attemptAt,
      ok,
    };
  return { version: CHECKS_VERSION, sources };
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
