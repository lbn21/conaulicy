// The repo's own checks of a ZUK item, on top of the place gate
// (lib/zuk-resolve.ts, which checks the day is written): stricter, so they
// stay. Pure. The day near the post's dates, the times in the text, a
// night span; with no note, the place written once on its own, nothing
// left out that the text adds to it (house numbers, "w części", a
// bracket); and the houses (the scope) read from the note. Any doubt is a
// reason: a day or time drops the post to a Notice, a place drops only that
// item (lib/zuk.ts).

import { addDays } from "./dates.ts";
import type { DisruptionScope } from "./disruptions.ts";
import { normalize } from "./normalize.ts";
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

// What, written right after a place, narrows or extends it: house numbers,
// "w części", a street, or a bracket without digits ("(przysiółek Dąbrowa)",
// "(Podłęże)"; "(noc 21/22 grudnia)" is not).
// "od 8:00" is a time, not a house.
const QUALIFIER =
  /^(?:(?:i\s+)?od\s+(?:nr\.?|numer\p{L}*)?\s*\d+(?![\d:.]\d)|nr\.?\s*\d|numer|w\s+częś|ul\.|ulic|os\.|al\.|\((?![^)]*\d)([^)]*)\))/u;
const PART_BEFORE = /w\s+częś\p{L}*(?:\s+miejscowości)?\s*$/u;

function occurrences(haystack: string, needle: string): number[] {
  const at: number[] = [];
  for (
    let i = haystack.indexOf(needle);
    i >= 0;
    i = haystack.indexOf(needle, i + 1)
  )
    at.push(i);
  return at;
}

/**
 * Null if every place in the text that `verbatim` names is the whole of
 * it: no house numbers, street, "w części" or bracket left out. A qualified
 * occurrence is fine only when its qualifier is another item's note of the
 * same place (`claimed`), or when it starts another place's phrase
 * (`others`: "Bałaje, ul. Przemysłowa (Lubaczów)"). At least one
 * occurrence must be plain.
 */
export function checkOmission(
  verbatim: string,
  locality: string,
  others: string[],
  claimed: string[],
  text: string,
): string | null {
  const t = normText(text);
  const v = normText(verbatim);
  const rest = others.map(normText).filter((o) => o !== v);
  const notes = claimed.map(normText);
  let plain = false;
  for (const p of occurrences(t, v)) {
    const e = p + v.length;
    const sep = /^\s*[,:-]?\s*/.exec(t.slice(e))?.[0] ?? "";
    const q = e + sep.length;
    const next = QUALIFIER.exec(t.slice(q));
    const bracketIsLocality =
      next?.[1] !== undefined && normalize(next[1]) === normalize(locality);
    const qualified =
      PART_BEFORE.test(t.slice(Math.max(0, p - 40), p)) ||
      (next !== null &&
        !bracketIsLocality &&
        !rest.some((o) => t.startsWith(o, q)));
    if (!qualified) {
      plain = true;
      continue;
    }
    // The qualifier right before or after it is another item's note.
    const owned = notes.some((n) =>
      occurrences(t, n).some((s) => s >= p - n.length - 3 && s <= q),
    );
    if (!owned) return `"${verbatim}" leaves out what the text adds to it`;
  }
  return plain ? null : `"${verbatim}" not named on its own`;
}

export type Derived = { scope: DisruptionScope; hamlet: string | null };

const RANGE =
  /od\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)\s+do\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)/gu;
const SINGLE = /(?:nr\.?|numer)\s*(\d{1,4}[a-z]?)(?![\d])/gu;
const HAMLET = /\(\s*przysiół\p{L}*\s+([^)]+?)\s*\)/u;

/**
 * Houses and hamlet from the item's note (one literal piece of the post,
 * lib/zuk-resolve.ts): house ranges or numbers, "(przysiółek X)". No note:
 * the whole place. Anything else in it ("w części", parity, an unlisted
 * part's name): part of the place, houses unknown. A range running
 * backwards, or ranges and numbers mixed, is a reason.
 */
export function noteScope(note: string | null): Derived | string {
  if (note === null) return { scope: { type: "whole" }, hamlet: null };
  let tail = normText(note);
  const hamlet = HAMLET.exec(tail)?.[1] ?? null;
  tail = tail.replace(HAMLET, " ");
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
  if (
    ranges.some((r) => Number.parseInt(r.from, 10) > Number.parseInt(r.to, 10))
  )
    return `a house range runs backwards in "${note}"`;
  if (ranges.length > 0 && numbers.length > 0)
    return `ranges and numbers in "${note}"`;
  const scope: DisruptionScope = residue
    ? { type: "unknown" }
    : ranges.length > 0
      ? { type: "ranges", ranges }
      : numbers.length > 0
        ? { type: "numbers", numbers }
        : { type: "whole" };
  return { scope, hamlet };
}

export type When = {
  /** Warsaw wall clock or null; end on the next day for a night cut. */
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
 * The item's day and times. Days are checked against the post's dates
 * (Warsaw wall clock): from the day before it was published to 31 days
 * after it was last edited.
 */
export function checkWhen(item: AiItem, context: ItemContext): When | string {
  const { text } = context;
  if (
    item.date < addDays(context.publishedAt.slice(0, 10), -1) ||
    item.date > addDays(context.updatedAt.slice(0, 10), 31)
  )
    return `${item.date} too far from the post's date`;
  for (const time of [item.start, item.end]) {
    if (time === null) continue;
    if (!validTime(time)) return `no such time ${time}`;
    if (!timeInText(time, text)) return `${time} not in the text`;
  }
  const night =
    item.start !== null &&
    item.end !== null &&
    item.end <= item.start &&
    item.start >= "18:00" &&
    item.end <= "08:00";
  if (item.start && item.end && item.end <= item.start && !night)
    return `ends ${item.end} before it starts ${item.start}`;

  const endDay = night ? addDays(item.date, 1) : item.date;
  return {
    start: item.start && `${item.date} ${item.start}:00`,
    end: item.end && `${endDay} ${item.end}:00`,
    endEstimated:
      item.end !== null &&
      (item.kind === "emergency" ||
        /przewidywan\p{L}*\s+wznowien/u.test(normText(text))),
  };
}
