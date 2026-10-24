// What the IMGW banner says (components/imgw-banner.tsx draws it as GOV.UK's
// notification banner): a function of the copy of the feed and the time, so
// the unit tests read every state. docs/data/imgw.md.
import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";
import {
  type Feed,
  forPowiat,
  IMGW_ATTRIBUTION,
  type Warning,
} from "./imgw-warnings.ts";

/** The powiat every page's banner covers (lubaczowski; all our gminas lie in it). */
export const POWIAT = "1809";

/** A copy older than this is not shown at all. */
const MAX_AGE_MS = 3 * 3_600_000;

// IMGW's three levels: the tag's colour, never the only signal (its text
// says the level).
const TAG = {
  1: "govuk-tag govuk-tag--yellow",
  2: "govuk-tag govuk-tag--orange",
  3: "govuk-tag govuk-tag--red",
} as const;

type BannerWarning = {
  id: string;
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
  /** The details' summary. */
  more: string;
  warnings: BannerWarning[];
  /** Visible, before the details: the source, short (in full in the footer). */
  source: string;
  footer: string;
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

/**
 * The banner, or null: no copy, a copy 3 hours old or older, or no warning
 * in force or to come for the powiat (a warning is dropped once it ends).
 */
export function banner(
  found: { feed: Feed; stale: boolean } | null,
  now: number,
): Banner | null {
  if (!found) return null;
  const fetchedAt = Date.parse(found.feed.fetchedAt);
  if (now - fetchedAt >= MAX_AGE_MS) return null;
  const warnings = forPowiat(found.feed.items, POWIAT, now);
  if (warnings.length === 0) return null;
  return {
    title: warnings.length === 1 ? "Ostrzeżenie IMGW" : "Ostrzeżenia IMGW",
    more:
      warnings.length === 1 ? "Szczegóły ostrzeżenia" : "Szczegóły ostrzeżeń",
    warnings: warnings.map((warning) => ({
      id: warning.id,
      event: warning.event,
      tag: TAG[warning.level],
      level: `Stopień ${warning.level} z 3`,
      ...times(warning, now),
      details: `Prawdopodobieństwo: ${warning.probability}%. ${warning.text}`,
    })),
    source: "Źródło: IMGW-PIB",
    footer: [
      "Dotyczy całego powiatu lubaczowskiego.",
      `Stan na ${clockTime(fetchedAt)}.`,
      ...(found.stale ? ["Nowszych danych nie udało się pobrać."] : []),
      ...IMGW_ATTRIBUTION,
    ].join(" "),
  };
}
