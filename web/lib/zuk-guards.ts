// The checks of an item's day and times on top of the place gate
// (lib/zuk-resolve.ts, which checks the day is written), and the houses
// (the scope) read from its note. Pure. The day near the post's dates, the
// times in the text, an end before the start on the next day. A day or
// time that fails drops the post to a Notice (lib/zuk.ts).

import { addDays } from "./dates.ts";
import type { DisruptionScope } from "./disruptions.ts";
import type { AiItem } from "./zuk-ai.ts";

/** Lower case, one kind of dash and space: what the guards compare. */
function normText(text: string): string {
  return text.replace(/[–—−]/g, "-").replace(/\s+/g, " ").toLowerCase().trim();
}

/** The time ("08:00") is in the text as "8:00", "08:00" or "8.00". */
export function timeInText(time: string, text: string): boolean {
  const [h, mm] = time.split(":");
  return new RegExp(`(?<!\\d)0?${Number(h)}[:.]${mm}(?!\\d)`).test(
    normText(text),
  );
}

const validTime = (t: string) =>
  /^\d{2}:\d{2}$/.test(t) &&
  Number(t.slice(0, 2)) < 24 &&
  Number(t.slice(3)) < 60;

const RANGE =
  /od\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)\s+do\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)/gu;
const SINGLE = /(?:nr\.?|numer)\s*(\d{1,4}[a-z]?)(?![\d])/gu;

/**
 * The houses from the item's note (one literal piece of the post): house
 * ranges or numbers. No note: the whole place. Anything else in it ("w
 * części", parity, a part's name), a range running backwards, or ranges
 * and numbers mixed: part of the place, houses unknown.
 */
export function noteScope(note: string | null): DisruptionScope {
  if (note === null) return { type: "whole" };
  let tail = normText(note);
  const ranges = [...tail.matchAll(RANGE)].map((r) => ({
    from: r[1],
    to: r[2],
  }));
  tail = tail.replace(RANGE, " ");
  const numbers = [...tail.matchAll(SINGLE)].map((r) => r[1]);
  tail = tail.replace(SINGLE, " ");
  const residue = tail
    .replace(/(?<!\p{L})(?:numery|i|oraz)(?!\p{L})/gu, " ")
    .replace(/[\s,:;.()-]+/g, "");
  const backwards = ranges.some(
    (r) => Number.parseInt(r.from, 10) > Number.parseInt(r.to, 10),
  );
  if (residue || backwards || (ranges.length > 0 && numbers.length > 0))
    return { type: "unknown" };
  if (ranges.length > 0) return { type: "ranges", ranges };
  if (numbers.length > 0) return { type: "numbers", numbers };
  return { type: "whole" };
}

export type When = {
  /** Warsaw wall clock or null; end on the next day if before the start. */
  start: string | null;
  end: string | null;
  endEstimated: boolean;
};

type ItemContext = {
  /** The post's title and body. */
  text: string;
  publishedAt: string;
  updatedAt: string;
};

/**
 * The item's day and times, or why not ("date", "time"). Days are checked
 * against the post's dates (Warsaw wall clock): from the day before it was
 * published to 31 days after it was last edited. An end before the start
 * is on the next day.
 */
export function checkWhen(
  item: AiItem,
  context: ItemContext,
): When | "date" | "time" {
  if (
    item.date < addDays(context.publishedAt.slice(0, 10), -1) ||
    item.date > addDays(context.updatedAt.slice(0, 10), 31)
  )
    return "date";
  for (const time of [item.start, item.end])
    if (time !== null && !(validTime(time) && timeInText(time, context.text)))
      return "time";
  if (item.start !== null && item.start === item.end) return "time";
  const endDay =
    item.start !== null && item.end !== null && item.end < item.start
      ? addDays(item.date, 1)
      : item.date;
  return {
    start: item.start && `${item.date} ${item.start}:00`,
    end: item.end && `${endDay} ${item.end}:00`,
    endEstimated: item.end !== null && item.end_estimated,
  };
}
