import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";

// Whether each live source's last check went well: status/checks.json in
// the private Blob store (lib/live-store.ts), by the ZUK cron at the end of
// a run (lib/zuk-cron.ts handleZukCron, the one writer), and only when its
// content changes: a source's state flips (good, failing), or a source is
// new. A run whose checks went as the last one's writes nothing. One shape
// for every source key: its state and the run it began at. Pure, so the
// unit tests read every state. docs/data/imgw.md.
//
// A page shows a source's latest data as it is, whatever its age: never
// hidden or expired for how long ago it was checked. A failing source's
// data stays shown, with a notice since when it fails (liveNotice).

/** Raise it when the shape changes: a file of another version is not read. */
export const CHECKS_VERSION = 2;

/** IMGW's warnings feed (lib/imgw-cron.ts). */
export const IMGW_KEY = "imgw";

/** PGE Dystrybucja's power outages (lib/pge-cron.ts). */
export const PGE_KEY = "pge";

/** A water source's posts (lib/sources, its id). */
export const waterKey = (id: string) => `water:${id}`;

type SourceCheck = {
  /** The source's last check went well. */
  ok: boolean;
  /** ISO: the run whose check began this state. */
  since: string;
};

export type Checks = {
  version: typeof CHECKS_VERSION;
  sources: Record<string, SourceCheck>;
};

const isTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function isCheck(value: unknown): value is SourceCheck {
  if (!value || typeof value !== "object") return false;
  const { ok, since } = value as Record<string, unknown>;
  return typeof ok === "boolean" && isTime(since);
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
 * well) at `attemptAt`; one in the state it was keeps its entry, one that
 * flipped begins its new state at `attemptAt`. Sources not tried this run
 * stay as they were.
 */
export function nextChecks(
  previous: Checks | null,
  results: Record<string, boolean>,
  attemptAt: string,
): Checks {
  const sources = { ...previous?.sources };
  for (const [key, ok] of Object.entries(results))
    if (sources[key]?.ok !== ok) sources[key] = { ok, since: attemptAt };
  return { version: CHECKS_VERSION, sources };
}

/** Whether `next` differs from `previous`: the file is written only then. */
export const checksChanged = (previous: Checks | null, next: Checks) =>
  JSON.stringify(previous) !== JSON.stringify(next);

/** Since when (ms) `key`'s source has been failing; null: it is not. */
export function failingSince(
  checks: Checks | null,
  key: string,
): number | null {
  const check = checks?.sources[key];
  return check && !check.ok ? Date.parse(check.since) : null;
}

/**
 * What the pages read of a live feed (lib/live-store.ts): its last good
 * copy, null when the cron has written none yet, or UNREADABLE when the
 * store could not be read now: an expected error, returned as a value.
 */
export const UNREADABLE = "unreadable";

/**
 * A feed's last good copy, since when its source has been failing (ms;
 * null: it is not), and when its items last changed (ms): the file is
 * written only when they do (lib/live-cron.ts), so its fetchedAt is that
 * run's, and doubles as the run's id (lib/live-runs.ts).
 */
export type LiveCopy<F> = {
  feed: F;
  failingSince: number | null;
  changedAt: number;
};

/**
 * The copy of a feed file (`feed`, parsed; null: no file yet) and the
 * status file's body (its `key`).
 */
export function liveCopyOf<F extends { fetchedAt: string }>(
  feed: F | null,
  checksBody: string | null,
  key: string,
): LiveCopy<F> | null {
  if (!feed) return null;
  return {
    feed,
    failingSince: failingSince(parseChecks(checksBody), key),
    changedAt: Date.parse(feed.fetchedAt),
  };
}

/** "9:52" today, else "piątku 30 października, 9:52". */
function since(time: number, now: number): string {
  return warsawDay(time) === warsawDay(now)
    ? clockTime(time)
    : `${dayGenitive(time)}, ${clockTime(time)}`;
}

/**
 * A live feed's notice: none while its source's checks go well; failing,
 * since when, and that its last data are still shown (`shown` of them
 * listed) or that it has none to show. `what` is the genitive after
 * „pobrać”: „ostrzeżeń IMGW”.
 */
export function liveNotice(
  what: string,
  failing: number | null,
  now: number,
  shown: number,
): string | null {
  if (failing === null) return null;
  const time = since(failing, now);
  return shown > 0
    ? `Od ${time} nie udało się nam pobrać ${what}. Pokazujemy ostatnie, jakie mamy.`
    : `Od ${time} nie udało się nam pobrać ${what}.`;
}
