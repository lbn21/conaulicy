// What the IMGW banner says (components/imgw-banner.tsx draws it as GOV.UK's
// notification banner): a function of the copy of the feed and the time, so
// the unit tests read every state. docs/data/imgw.md.
import { clockTime, dayGenitive, warsawDay } from "./date-labels.ts";
import { type Feed, forPowiat, type Warning } from "./imgw-warnings.ts";

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
  when: string;
  details: string;
};

export type Banner = {
  title: string;
  warnings: BannerWarning[];
  footer: string;
};

/**
 * In force: "Obowiązuje teraz, do niedzieli 25 października, 19:00." To come:
 * "Od niedzieli 25 października, 13:00 do 19:00.", with the end's day too if
 * it ends on another day.
 */
function when({ validFrom, validTo }: Warning, now: number): string {
  const from = Date.parse(validFrom);
  const to = Date.parse(validTo);
  const end = `${dayGenitive(to)}, ${clockTime(to)}`;
  if (from <= now) return `Obowiązuje teraz, do ${end}.`;
  const sameDay = warsawDay(from) === warsawDay(to);
  return `Od ${dayGenitive(from)}, ${clockTime(from)} do ${sameDay ? clockTime(to) : end}.`;
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
    warnings: warnings.map((warning) => ({
      id: warning.id,
      event: warning.event,
      tag: TAG[warning.level],
      level: `Stopień ${warning.level} z 3`,
      when: when(warning, now),
      details: `Prawdopodobieństwo: ${warning.probability}%. ${warning.text}`,
    })),
    footer: [
      "Dotyczy całego powiatu lubaczowskiego.",
      `Stan na ${clockTime(fetchedAt)}.`,
      ...(found.stale ? ["Nowszych danych nie udało się pobrać."] : []),
      // IMGW-PIB's terms, §5: the source, and that the data was processed.
      "Źródłem pochodzenia danych jest IMGW-PIB; dane zostały przetworzone.",
    ].join(" "),
  };
}
