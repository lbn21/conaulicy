// What the IMGW banner says (components/imgw-banner.tsx draws it as GOV.UK's
// notification banner): a function of the last good copy of the feed and
// the time, so the unit tests read every state. docs/data/imgw.md.
import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";
import {
  type Feed,
  forPowiat,
  IMGW_ATTRIBUTION,
  parseFeedFile,
  type Warning,
} from "./imgw-warnings.ts";
import { checkAge, IMGW_KEY, oldestCheck, parseChecks } from "./live-status.ts";

/** The powiat every page's banner covers (lubaczowski; all our gminas lie in it). */
export const POWIAT = "1809";

/** Where the banner and the address page send readers for more. */
export const IMGW_PAGE = "https://meteo.imgw.pl/";

/** The last sentence of every notice, its link IMGW_PAGE. */
export const CURRENT = {
  text: "Aktualne znajdziesz na",
  link: "meteo.imgw.pl",
};

/** The last good copy of the feed and when IMGW was last checked well (ms). */
export type ImgwCopy = { feed: Feed; checkedAt: number };

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

// IMGW's three levels: the tag's colour, never the only signal (its text
// says the level).
const TAG = {
  1: "govuk-tag govuk-tag--yellow",
  2: "govuk-tag govuk-tag--orange",
  3: "govuk-tag govuk-tag--red",
} as const;

type BannerWarning = {
  id: string;
  /** When it starts and ends (ISO). */
  from: string;
  to: string;
  event: string;
  /** The tag's classes. */
  tag: string;
  level: string;
  /** Visible, after the tag: "do niedzieli 25 października, 2:00". */
  short: string;
  /** In the details: the full time sentence. */
  when: string;
  details: string;
};

export type Banner = {
  title: string;
  /**
   * Visible, first: the last good check is over STALE_MS old (lib/live-status.ts),
   * so the data may be out of date; CURRENT follows it. null: fresh.
   */
  notice: string | null;
  /** The details' summary. */
  more: string;
  /** None while the copy is too old, or none in force or to come. */
  warnings: BannerWarning[];
  /** Visible, before the details: the source, short (in full in the attribution). */
  source: string;
  footer: string;
  /** IMGW-PIB's required wording (IMGW_ATTRIBUTION), after the footer. */
  attribution: string;
};

const at = (time: number) => `${dayGenitive(time)}, ${clockTime(time)}`;

/**
 * In force: "do niedzieli 25 października, 19:00" and "Obowiązuje teraz, do
 * niedzieli 25 października, 19:00." To come: "od niedzieli 25 października,
 * 13:00" and "Od niedzieli 25 października, 13:00 do 19:00.", with the end's
 * day too if it ends on another day.
 */
function times({ validFrom, validTo }: Warning, now: number) {
  const from = Date.parse(validFrom);
  const to = Date.parse(validTo);
  if (from <= now)
    return { short: `do ${at(to)}`, when: `Obowiązuje teraz, do ${at(to)}.` };
  const sameDay = warsawDay(from) === warsawDay(to);
  return {
    short: `od ${at(from)}`,
    when: `Od ${at(from)} do ${sameDay ? clockTime(to) : at(to)}.`,
  };
}

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
 * The banner, or null: no copy, or a fresh one without any warning in
 * force or to come for the powiat (a warning is dropped once it ends).
 * Never null while there is a copy whose last good check is stale: then
 * the notice says so, with or without warnings; too old (MAX_AGE_MS), the
 * warnings are no longer listed, only the notice.
 */
export function banner(copy: ImgwCopy | null, now: number): Banner | null {
  if (!copy) return null;
  const age = checkAge(copy.checkedAt, now);
  const warnings =
    age === "too-old" ? [] : forPowiat(copy.feed.items, POWIAT, now);
  const said = notice(age, copy.checkedAt, now, warnings.length);
  if (warnings.length === 0 && !said) return null;
  return {
    title: warnings.length === 1 ? "Ostrzeżenie IMGW" : "Ostrzeżenia IMGW",
    notice: said,
    more:
      warnings.length === 1 ? "Szczegóły ostrzeżenia" : "Szczegóły ostrzeżeń",
    warnings: warnings.map((warning) => ({
      id: warning.id,
      from: warning.validFrom,
      to: warning.validTo,
      event: warning.event,
      tag: TAG[warning.level],
      level: `Stopień ${warning.level} z 3`,
      ...times(warning, now),
      details: `Prawdopodobieństwo: ${warning.probability}%. ${warning.text}`,
    })),
    source: "Źródło: IMGW-PIB",
    footer: `Dotyczy całego powiatu lubaczowskiego. Stan na ${clockTime(copy.checkedAt)}.`,
    attribution: IMGW_ATTRIBUTION.join(" "),
  };
}
