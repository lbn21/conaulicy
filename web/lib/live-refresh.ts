// How the zuk cron (app/api/cron/zuk/route.ts, every 15 minutes) keeps the
// prerendered pages current, one source tag at a time (lib/page-cache.ts):
//
// - A source whose content changed this run (its file written): its tag
//   revalidated with the "max" profile WAIT_MS after the run's last write,
//   inside after(), as the pages read the Blob's CDN copy, up to 60 s
//   behind a write (every file is written with cacheControlMaxAge 60).
// - At the start of every run, from the home page's HTML (LIVE_ATTR, the
//   marks it was rendered with): a source whose stored run id differs
//   from the rendered one (a revalidation lost, or read too early) is
//   revalidated again; a page rendered on another Warsaw day has every
//   dataset page revalidated (day words, the 7-day window); a dataset
//   version other than the pointer's goes through syncDataset
//   (lib/dataset-sync.ts).
//
// A source's run id is the time its data last changed (its changedAt:
// IMGW's and PGE's fetchedAt, a water file's generatedAt), written only by
// the run that changed it, so it is unique per changing run. Pure, so the
// unit tests read every case.

import type { SourceTag } from "./page-cache.ts";

/** The wait after the last write: the Blob CDN's 60 s and a margin. */
export const WAIT_MS = 65_000;

/** The cron's own time it may not use: the wait and a margin (maxDuration). */
export const REFRESH_RESERVE_S = 70;

/** The home page's attribute with the marks it was rendered with. */
export const LIVE_ATTR = "data-live";

/**
 * What a page was rendered with: the Warsaw day, the dataset version and
 * each live source's run id, by its key (lib/live-status.ts: "imgw",
 * "pge", "water:<id>"); null: no data.
 */
export type LiveMarks = {
  day: string;
  dataset: string;
  runs: Record<string, string | null>;
};

/** A source key's tag: every water source is "water". */
function tagOf(key: string): SourceTag {
  if (key.startsWith("water:")) return "water";
  return key as SourceTag;
}

/** The marks' attribute value, as the home page writes it. */
export const marksAttr = (marks: LiveMarks) => JSON.stringify(marks);

/** The marks in a page's HTML, or null: none, or not the shape. */
export function marksOf(html: string): LiveMarks | null {
  const match = new RegExp(`${LIVE_ATTR}="([^"]*)"`).exec(html);
  if (!match) return null;
  try {
    const value = JSON.parse(
      match[1]
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
    ) as LiveMarks;
    if (
      typeof value?.day !== "string" ||
      typeof value.dataset !== "string" ||
      !value.runs ||
      typeof value.runs !== "object"
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * The tags to revalidate at a run's start: each source whose stored run
 * id (`stored`, read from the Blob's origin) is not the rendered one, and
 * the dataset when the page is of another day than `today`. No marks (the
 * page could not be read): none, so a failing read never re-renders every
 * page each run; the route logs it.
 */
export function laggingTags(
  marks: LiveMarks | null,
  stored: Record<string, string | null>,
  today: string,
): SourceTag[] {
  if (!marks) return [];
  const tags = new Set<SourceTag>();
  for (const [key, run] of Object.entries(stored))
    if ((marks.runs[key] ?? null) !== run) tags.add(tagOf(key));
  if (marks.day !== today) tags.add("dataset");
  return [...tags];
}

/** The tags of the sources whose content this run changed, by key. */
export function changedTags(changed: Record<string, boolean>): SourceTag[] {
  return [
    ...new Set(
      Object.entries(changed)
        .filter(([, yes]) => yes)
        .map(([key]) => tagOf(key)),
    ),
  ];
}
