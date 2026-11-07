// Which IMGW warnings the address page shows (lib/weather-module.ts), and
// the notice when the last good copy of the feed is old: a function of that
// copy and the time, so the unit tests read every state. docs/data/imgw.md.
import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";
import {
  type Feed,
  forPowiat,
  parseFeedFile,
  type Warning,
} from "./imgw-warnings.ts";
import { checkAge, IMGW_KEY, oldestCheck, parseChecks } from "./live-status.ts";

/** The powiat the warnings cover (lubaczowski; all our gminas lie in it). */
export const POWIAT = "1809";

/** Where the address page sends readers for more. */
export const IMGW_PAGE = "https://meteo.imgw.pl/";

/** The last sentence of every notice, its link IMGW_PAGE. */
export const CURRENT = {
  text: "Aktualne znajdziesz na",
  link: "meteo.imgw.pl",
};

/** The last good copy of the feed and when IMGW was last checked well (ms). */
export type ImgwCopy = { feed: Feed; checkedAt: number };

/**
 * What the pages read from the store (lib/live-store.ts imgwCopy): the
 * copy, null when the cron has written none yet, or UNREADABLE when the
 * store could not be read now: an expected error, returned as a value.
 */
export const UNREADABLE = "unreadable";
export type ImgwRead = ImgwCopy | null | typeof UNREADABLE;

/** The notice when the store cannot be read now; CURRENT follows it. */
const UNREADABLE_NOTICE = "Nie udało się teraz sprawdzić ostrzeżeń IMGW.";

/**
 * The copy from the feed file and the status file (lib/live-store.ts), or
 * null when there is no feed file yet. The last good check is the status
 * file's (every good run), never older than the feed file's own time (the
 * feed is written only when it changed). Throws on a feed file that is not
 * one (lib/imgw-warnings.ts parseFeedFile).
 */
export function imgwCopyOf(
  feedBody: string | null,
  checksBody: string | null,
): ImgwCopy | null {
  const feed = parseFeedFile(feedBody);
  if (!feed) return null;
  const fetchedAt = Date.parse(feed.fetchedAt);
  const checked = oldestCheck(parseChecks(checksBody), [IMGW_KEY]);
  return { feed, checkedAt: Math.max(checked ?? fetchedAt, fetchedAt) };
}

/** A warning as the page shows it: IMGW's own words, its times (ISO). */
export type ShownWarning = Pick<
  Warning,
  "id" | "event" | "level" | "probability" | "text"
> & { from: string; to: string };

export type Shown = {
  /**
   * First: the last good check is over STALE_MS old (lib/live-status.ts),
   * so the data may be out of date; CURRENT follows it. null: fresh.
   */
  notice: string | null;
  /** None while the copy is too old, or none in force or to come. */
  warnings: ShownWarning[];
};

const at = (time: number) => `${dayGenitive(time)}, ${clockTime(time)}`;

/** "9:52" today, else "piątku 30 października, 9:52": when the last data is from. */
function since(time: number, now: number): string {
  return warsawDay(time) === warsawDay(now) ? clockTime(time) : at(time);
}

/**
 * The notice: none while the last good check is fresh; stale, when the
 * last data is from (the warnings still listed); too old, only that.
 */
function notice(
  age: ReturnType<typeof checkAge>,
  checkedAt: number,
  now: number,
  warnings: number,
): string | null {
  const time = since(checkedAt, now);
  if (age === "fresh") return null;
  if (age === "too-old")
    return `Od ${time} nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.`;
  return warnings > 0
    ? `Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z ${time}.`
    : `Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z ${time}.`;
}

/**
 * What to show, or null: no copy, or a fresh one without any warning in
 * force or to come for the powiat (a warning is dropped once it ends).
 * Never null while there is a copy whose last good check is stale: then
 * the notice says so, with or without warnings; too old (MAX_AGE_MS), the
 * warnings are no longer listed, only the notice. The store unreadable:
 * the notice alone, that we could not check now.
 */
export function shownWarnings(copy: ImgwRead, now: number): Shown | null {
  if (!copy) return null;
  if (copy === UNREADABLE) return { notice: UNREADABLE_NOTICE, warnings: [] };
  const age = checkAge(copy.checkedAt, now);
  const warnings =
    age === "too-old" ? [] : forPowiat(copy.feed.items, POWIAT, now);
  const said = notice(age, copy.checkedAt, now, warnings.length);
  if (warnings.length === 0 && !said) return null;
  return {
    notice: said,
    warnings: warnings.map((warning) => ({
      id: warning.id,
      from: warning.validFrom,
      to: warning.validTo,
      event: warning.event,
      level: warning.level,
      probability: warning.probability,
      text: warning.text,
    })),
  };
}
