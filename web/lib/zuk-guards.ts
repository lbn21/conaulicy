// The checks of an item's day and times on top of the place gate
// (lib/zuk-resolve.ts, which checks the day is written), and the houses
// (the scope) the model read from its note, checked against it. Pure. The
// day near the post's dates, the times on the item's own lines, an end
// before the start on the next day.
// A day or time that fails drops the post to a Notice (lib/zuk.ts).

import { addDays } from "./dates.ts";
import type { DisruptionScope } from "./disruptions.ts";
import type { AiItem } from "./zuk-ai.ts";
import { inPost } from "./zuk-resolve.ts";

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

const HOUSE = /^\d{1,4}[a-z]?$/i;

/**
 * The note's numbers that are not houses, gone: the literal names of the
 * locality's streets ("3 Maja"), the hours after „godz.” ("8-16"), clock
 * times ("8:00", "12.00"), dates ("26.10", "26.10.2026") and our area's
 * postcodes ("37-600"; never "10-100", a house range).
 */
function houseWords(words: string, streets: readonly string[]): string {
  let out = words;
  for (const name of streets) {
    const literal = normText(name);
    if (/\d/.test(literal)) out = out.split(literal).join(" ");
  }
  return out
    .replace(
      /godz(?:in[aiy]?)?\.?\s*(?:od\s*)?\d{1,2}(?:[:.]\d{2})?(?:\s*(?:-|do)\s*\d{1,2}(?:[:.]\d{2})?)?/gu,
      " ",
    )
    .replace(/(?<!\d)\d{1,2}[:.]\d{2}(?:\.\d{2,4})?(?!\d)/gu, " ")
    .replace(/\b37-\d{3}\b/gu, " ");
}

/**
 * The houses the model read from the item's note (`houses`), each checked
 * against the note: digits and at most one letter, both ends written in
 * the note as whole words, `from` not above `to`; and every other number
 * in the note an end of one of them (houseWords: not a street's name, an
 * hour, a date or a postcode). No note and no houses: the whole place. A
 * house that fails, an open range, a number no house covers ("44–92 oraz
 * 100" read as 44–92 only), or a note with no houses: part of the place,
 * houses unknown. `streets`: the names of the locality's streets.
 */
export function houseScope(
  note: string | null,
  houses: AiItem["houses"],
  streets: readonly string[] = [],
): DisruptionScope {
  if (note === null)
    return houses.length === 0 ? { type: "whole" } : { type: "unknown" };
  const words = normText(note);
  const written = (nr: string) =>
    new RegExp(`(?<![\\p{L}\\d])${nr.toLowerCase()}(?![\\p{L}\\d])`, "u").test(
      words,
    );
  const ok = (h: AiItem["houses"][number]): h is { from: string; to: string } =>
    h.to !== null &&
    HOUSE.test(h.from) &&
    HOUSE.test(h.to) &&
    written(h.from) &&
    written(h.to) &&
    Number.parseInt(h.from, 10) <= Number.parseInt(h.to, 10);
  if (houses.length === 0 || !houses.every(ok)) return { type: "unknown" };
  const ends = new Set(houses.flatMap((h) => [h.from, h.to]));
  const numbers =
    houseWords(words, streets).match(
      /(?<![\p{L}\d])\d{1,4}[a-z]?(?![\p{L}\d])/gu,
    ) ?? [];
  if (numbers.some((n) => ![...ends].some((e) => e.toLowerCase() === n)))
    return { type: "unknown" };
  if (houses.every((h) => h.from === h.to))
    return { type: "numbers", numbers: houses.map((h) => h.from) };
  return { type: "ranges", ranges: houses };
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
  /** Every item's quoted pieces in the post (quoted()), this one's too. */
  pieces: string[];
};

/** The item's own words in the post: the pieces the gate checks are in it. */
export const quoted = (item: AiItem): string[] =>
  [
    item.locality_verbatim,
    item.street_verbatim,
    item.note,
    item.whole_town_verbatim,
  ].filter((p): p is string => p !== null && p.trim() !== "");

/**
 * The lines holding `piece`, as the quote check finds it: one line, or a
 * run of up to three it spans (each line of the run needed).
 */
function linesOf(lines: string[], piece: string): number[] {
  const out: number[] = [];
  const spans = (from: number, to: number) =>
    inPost(piece, lines.slice(from, to).join(" "));
  for (let i = 0; i < lines.length; i++)
    for (let k = 1; k <= 3 && i + k <= lines.length; k++)
      if (spans(i, i + k)) {
        if (k === 1 || !spans(i + 1, i + k))
          for (let j = i; j < i + k; j++) out.push(j);
        break;
      }
  return out;
}

/**
 * The text an item's times may come from: the lines that quote it, and the
 * lines that quote no item (a post's opening line with the hours for all);
 * never a line only of other items, with hours of their own.
 */
function itemText(item: AiItem, context: ItemContext): string {
  const lines = context.text.split("\n");
  const own = new Set(quoted(item).flatMap((p) => linesOf(lines, p)));
  const any = new Set(context.pieces.flatMap((p) => linesOf(lines, p)));
  return lines.filter((_, i) => own.has(i) || !any.has(i)).join("\n");
}

/**
 * The item's day and times, or why not ("date", "time"). Days are checked
 * against the post's dates (Warsaw wall clock): from the day before it was
 * published to 31 days after it was last edited; times against the item's
 * own lines (itemText). An end before the start is on the next day.
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
  const own = itemText(item, context);
  for (const time of [item.start, item.end])
    if (time !== null && !(validTime(time) && timeInText(time, own)))
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
