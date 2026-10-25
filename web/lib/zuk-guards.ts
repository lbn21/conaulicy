// Deterministic checks of what the model read from a ZUK post (lib/zuk-ai.ts)
// against the post's own text. Pure. Every value must be in the text: the
// day and month (or inside an "od D.M do D.M" range), the weekday if
// written, the times, the place phrase; and the place phrase must not leave
// out a street, house numbers or "w części" that the text gives with it.
// From that phrase, not from the model, come the house numbers and the
// hamlet. Any doubt is a reason, and the post stays a Notice.

import { addDays } from "./dates.ts";
import type { DisruptionScope } from "./disruptions.ts";
import { normalize } from "./normalize.ts";
import type { AiItem } from "./zuk-ai.ts";

const WEEKDAYS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];

/** Lower case, one kind of dash and space: what the guards compare. */
function normText(text: string): string {
  return text.replace(/[–—−]/g, "-").replace(/\s+/g, " ").toLowerCase().trim();
}

function realDate(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Null if the day and month are in the text (in that year, if it gives
 * one) with the right weekday where one is written, or inside an
 * "od D.M(.Y) do D.M(.Y)" range; else the reason.
 */
export function checkDate(iso: string, text: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !realDate(iso))
    return `no such date ${iso}`;
  const [y, m, d] = iso.split("-").map(Number);
  const t = normText(text);
  const literal = new RegExp(
    `(?<!\\d)0?${d}\\.0?${m}(?:\\.(\\d{4}))?(?!\\d)`,
    "g",
  );
  let found = false;
  for (const hit of t.matchAll(literal)) {
    if (hit[1] && Number(hit[1]) !== y) continue;
    found = true;
    const after = t.slice(hit.index + hit[0].length);
    const named = /^\s*r?\.?\s*\(\s*([^)\s]+)\s*\)/.exec(after)?.[1];
    if (named && WEEKDAYS.includes(named)) {
      const weekday = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
      if (named !== weekday)
        return `${iso} is a ${weekday}, text says ${named}`;
    }
  }
  if (found) return null;
  const DM = String.raw`(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?`;
  const range = new RegExp(
    `od\\s+${DM}\\s*r?\\.?\\s*(?:\\([^)]*\\))?\\s*do\\s+${DM}`,
    "g",
  );
  for (const r of t.matchAll(range)) {
    const at = (dd: string, mm: string, yy: string | undefined) =>
      `${yy ?? y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const from = at(r[1], r[2], r[3]);
    const to = at(r[4], r[5], r[6]);
    if (!realDate(from) || !realDate(to) || to > addDays(from, 31)) continue;
    if (from <= iso && iso <= to) return null;
  }
  return `${d}.${m} not in the text`;
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
const STREET_WORD = /(?<!\p{L})(?:ul\.|ulica|ulice)(?!\p{L})/u;

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
 * occurrence is fine only inside another item's longer phrase, or when the
 * qualifier starts another item's phrase ("Bałaje, ul. Przemysłowa
 * (Lubaczów)"). At least one occurrence must be plain.
 */
export function checkOmission(
  verbatim: string,
  locality: string,
  others: string[],
  text: string,
): string | null {
  const t = normText(text);
  const v = normText(verbatim);
  const rest = others.map(normText).filter((o) => o !== v);
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
    const inside = rest.some(
      (o) =>
        o.length > v.length &&
        occurrences(t, o).some((s) => s <= p && s + o.length >= e),
    );
    if (!inside) return `"${verbatim}" leaves out what the text adds to it`;
  }
  return plain ? null : `"${verbatim}" not named on its own`;
}

export type Derived = { scope: DisruptionScope; hamlet: string | null };

const RANGE =
  /od\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)\s+do\s+(?:nr\.?|numeru)?\s*(\d{1,4}[a-z]?)/gu;
const SINGLE = /(?:nr\.?|numer)\s*(\d{1,4}[a-z]?)(?![\d])/gu;
const HAMLET = /\(\s*przysiół\p{L}*\s+([^)]+?)\s*\)/u;

/**
 * Houses and hamlet from the place phrase: what follows the street (or the
 * locality). Anything there we do not read is a reason.
 */
export function deriveScope(item: AiItem): Derived | string {
  const v = normText(item.place_verbatim);
  const loc = normText(item.locality);
  const at = v.indexOf(loc);
  if (at < 0)
    return `locality "${item.locality}" not in "${item.place_verbatim}"`;
  let tail: string;
  if (item.street) {
    const s = normText(item.street);
    const sAt = v.lastIndexOf(s);
    if (sAt < 0)
      return `street "${item.street}" not in "${item.place_verbatim}"`;
    tail = v.slice(sAt + s.length);
  } else {
    if (STREET_WORD.test(v))
      return `"${item.place_verbatim}" names a street, the item none`;
    tail = v.slice(at + loc.length);
  }
  let partial = /w\s+częś/u.test(v.slice(0, at));
  const hamlet = HAMLET.exec(tail)?.[1] ?? null;
  tail = tail.replace(HAMLET, " ").replace(`(${loc})`, " ");
  if (item.note) {
    partial = true;
    tail = tail.replace(normText(item.note), " ");
  }
  const ranges = [...tail.matchAll(RANGE)].map((r) => ({
    from: r[1],
    to: r[2],
  }));
  tail = tail.replace(RANGE, " ");
  const numbers = [...tail.matchAll(SINGLE)].map((r) => r[1]);
  tail = tail.replace(SINGLE, " ");
  const residue = tail
    .replace(/(?<!\p{L})(?:numery|i|oraz|w\s+części)(?!\p{L})/gu, " ")
    .replace(/[\s,:;.()-]+/g, "");
  if (residue) return `cannot read "${residue}" in "${item.place_verbatim}"`;
  if (
    ranges.some((r) => Number.parseInt(r.from, 10) > Number.parseInt(r.to, 10))
  )
    return `a house range runs backwards in "${item.place_verbatim}"`;
  if (ranges.length > 0 && numbers.length > 0)
    return `ranges and numbers in "${item.place_verbatim}"`;
  const scope: DisruptionScope =
    ranges.length > 0
      ? { type: "ranges", ranges }
      : numbers.length > 0
        ? { type: "numbers", numbers }
        : partial
          ? { type: "unknown" }
          : { type: "whole" };
  return { scope, hamlet };
}

export type Checked = Derived & {
  /** Warsaw wall clock or null; end on the next day for a night cut. */
  start: string | null;
  end: string | null;
  endEstimated: boolean;
};

/**
 * Every guard on one item of a post: `text` is the title and the body,
 * `others` every item's place phrase. Days are checked against the post's
 * dates (Warsaw wall clock): from the day before it was published to 31
 * days after it was last edited.
 */
export function checkItem(
  item: AiItem,
  context: {
    text: string;
    others: string[];
    publishedAt: string;
    updatedAt: string;
  },
): Checked | string {
  const { text } = context;
  const date = checkDate(item.date, text);
  if (date) return date;
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

  const t = normText(text);
  if (!t.includes(normText(item.place_verbatim)))
    return `"${item.place_verbatim}" not in the text`;
  if (item.note && !t.includes(normText(item.note)))
    return `note "${item.note}" not in the text`;
  const derived = deriveScope(item);
  if (typeof derived === "string") return derived;
  const omission = checkOmission(
    item.place_verbatim,
    item.locality,
    context.others,
    text,
  );
  if (omission) return omission;

  const endDay = night ? addDays(item.date, 1) : item.date;
  return {
    ...derived,
    start: item.start && `${item.date} ${item.start}:00`,
    end: item.end && `${endDay} ${item.end}:00`,
    endEstimated:
      item.end !== null &&
      (item.kind === "emergency" || /przewidywan\p{L}*\s+wznowien/u.test(t)),
  };
}
