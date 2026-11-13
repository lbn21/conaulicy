// Which IMGW warnings the address page shows (lib/weather-module.ts), and
// the notice when the last good copy of the feed is old: a function of that
// copy and the time, so the unit tests read every state. docs/data/imgw.md.
import {
  type Feed,
  forPowiat,
  parseFeedFile,
  type Warning,
} from "./imgw-warnings.ts";
import {
  checkAge,
  IMGW_KEY,
  type LiveCopy,
  liveCopyOf,
  liveNotice,
  UNREADABLE,
} from "./live-status.ts";

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
export type ImgwCopy = LiveCopy<Feed>;

/**
 * What the pages read from the store (lib/live-reads.ts imgwCopy): the
 * copy, null when the cron has written none yet, or UNREADABLE
 * (lib/live-status.ts).
 */
export { UNREADABLE };
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
  return liveCopyOf(parseFeedFile(feedBody), checksBody, IMGW_KEY);
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
  const said = liveNotice(
    "ostrzeżeń IMGW",
    copy.checkedAt,
    now,
    warnings.length,
  );
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
