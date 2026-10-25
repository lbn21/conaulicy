// Water cuts announced by Zakład Usług Komunalnych w Mokrzycy (ZUK), posted
// on the gmina's site (https://www.gminalubaczow.pl, WordPress REST API).
// Grok reads each post (lib/zuk-ai.ts); here, purely, that reading becomes
// Disruptions through our guards (lib/zuk-guards.ts) and our places
// (lib/zuk-resolve.ts). A wrong date or a wrong or widened place is the
// worst outcome and leaving one out is acceptable: an item whose place
// fails is dropped, alone; a day or time that fails makes the whole post a
// Notice (lib/disruptions.ts), and so does a post left with no item. The
// cron that runs it: lib/zuk-cron.ts.

import { addDays } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import type { AiResult } from "./zuk-ai.ts";
import { checkPlace, checkWhen } from "./zuk-guards.ts";
import { resolvePlace, type ZukPlaces } from "./zuk-resolve.ts";

export const SOURCE_NAME = "Zakład Usług Komunalnych w Mokrzycy";

/** A post as the WordPress REST API returns it: the fields we read. */
export type ZukPost = {
  id: number;
  /** Site time (Warsaw), "2026-10-23T18:59:43". */
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  lt: "<",
  gt: ">",
};

/** HTML as plain text: one paragraph, list item or line per line. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/(?:p|li|h\d|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name] ?? all)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Site time "2026-10-23T18:59:43" as wall clock "2026-10-23 18:59:43". */
export const wall = (wp: string) => wp.replace("T", " ").slice(0, 19);

const fullText = (post: ZukPost) =>
  `${plainText(post.title.rendered)}\n${plainText(post.content.rendered)}`;

const OUTAGE =
  /przerw\p{L}*\s+w\s+dostaw\p{L}*\s+wody|brak\p{L}*\s+wody|wyłącz\p{L}*\s+wody|awari\p{L}*\s+(?:sieci\s+)?wodoci\p{L}*/iu;
const SOURCE =
  /Zakład\p{L}*\s+Usług\s+Komunalnych|Mokrzyc|Wójt\p{L}*\s+Gminy/iu;

/**
 * A notice of a water cut: an outage phrase and its source (ZUK or the
 * wójt); the gmina's other posts are not read.
 */
export function isZukPost(post: ZukPost): boolean {
  const all = fullText(post);
  return OUTAGE.test(all) && SOURCE.test(all);
}

const CHANGE =
  /aktualizac|zmian\p{L}* (?:termin|dat|dni)|wydłuż|przesun|przełoż/iu;

/** A post that changes dates ("aktualizacja dat", "wydłużenie terminu"). */
export function isChangePost(post: ZukPost): boolean {
  return CHANGE.test(fullText(post));
}

const namePattern = (name: string) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/**
 * Every locality the post may concern, by name: for a Notice. Namesakes all
 * count; a name inside a longer one ("Basznia" in "Basznia Dolna") does not.
 */
export function mentionedLocalities(
  post: ZukPost,
  places: ZukPlaces,
): string[] {
  const line = fullText(post);
  const hits = places.localities.flatMap((l) =>
    [
      ...line.matchAll(
        new RegExp(`(?<![\\p{L}])${namePattern(l.name)}(?![\\p{L}])`, "giu"),
      ),
    ].map((m) => ({ id: l.id, from: m.index, to: m.index + m[0].length })),
  );
  const ids = hits
    .filter(
      (h) =>
        !hits.some(
          (o) =>
            o.to - o.from > h.to - h.from && o.from <= h.from && o.to >= h.to,
        ),
    )
    .map((h) => h.id);
  return [...new Set(ids)].sort();
}

export type PostReading =
  | {
      status: "parsed";
      items: Disruption[];
      /** Items whose place failed, with the reason. */
      dropped: string[];
    }
  | { status: "notice"; reason: string };

/**
 * The model's reading of one post, checked and resolved: Disruptions for
 * every item whose place passes, as long as every day and time does, else
 * a Notice with the first reason.
 */
export function readPost(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  checkedAt: string,
): PostReading {
  const notice = (reason: string): PostReading => ({
    status: "notice",
    reason,
  });
  if (!ai.is_outage_notice) return notice("not an outage notice");
  if (ai.items.length === 0) return notice("no items");
  const text = fullText(post);
  const publishedAt = wall(post.date);
  const updatedAt = wall(post.modified);
  const others = ai.items.map((i) => i.place_verbatim);
  const source = { name: SOURCE_NAME, url: post.link, checkedAt };

  const items: Disruption[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const [n, item] of ai.items.entries()) {
    const why = (reason: string) => `item ${n + 1}: ${reason}`;
    const when = checkWhen(item, { text, others, publishedAt, updatedAt });
    if (typeof when === "string") return notice(why(when));
    const checked = checkPlace(item, { text, others });
    const resolved =
      typeof checked === "string"
        ? checked
        : resolvePlace(
            {
              locality: item.locality,
              street: item.street,
              hamlet: checked.hamlet,
              scope: checked.scope,
              phrase: item.place_verbatim,
            },
            text,
            places,
          );
    if (typeof resolved === "string") {
      dropped.push(why(resolved));
      continue;
    }
    for (const { label, ...place } of resolved.places) {
      const uid = `zuk-${post.id}-${item.date}-${place.streetId ?? place.localityId}`;
      if (seen.has(uid)) return notice(why(`${uid} twice`));
      seen.add(uid);
      items.push({
        uid,
        kind: "water",
        cause: item.kind,
        date: item.date,
        ...when,
        place,
        label,
        where: item.place_verbatim,
        scope: resolved.scope,
        note: item.note,
        publishedAt,
        updatedAt,
        source,
      });
    }
  }
  if (items.length === 0) return notice(`no place: ${dropped[0]}`);
  return { status: "parsed", items, dropped };
}

const TITLE_DAY =
  /(?<!\d)(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\.(\d{1,2})\.(\d{4})(?!\d)/g;

/**
 * The days a post's title gives in full ("26-29.10.2026", "awaria
 * 16.12.2025"), as YYYY-MM-DD; none for "noc 21/22 grudnia" or no date.
 */
export function titleDays(title: string): string[] {
  const pad = (n: string) => n.padStart(2, "0");
  return [...title.matchAll(TITLE_DAY)].flatMap(([, from, to, m, y]) =>
    [from, to]
      .filter((d) => d !== undefined)
      .map((d) => `${y}-${pad(m)}-${pad(d)}`),
  );
}

/** Every day the title gives is before `today`: no need to read it. */
export function isPastPost(post: ZukPost, today: string): boolean {
  const days = titleDays(plainText(post.title.rendered));
  return days.length > 0 && days.every((d) => d < today);
}

/** The Warsaw day a cut is over after: its end's, else its start's. */
const lastDay = (d: Disruption) => (d.end ?? d.start ?? d.date).slice(0, 10);

/** Cuts still to come or under way on `today` (Warsaw). */
export const current = (items: Disruption[], today: string) =>
  items.filter((d) => lastDay(d) >= today);

/** The day from which a Notice is no longer shown: 14 days after posting. */
export const noticeUntil = (publishedAt: string) =>
  addDays(publishedAt.slice(0, 10), 14);
