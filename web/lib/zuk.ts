// Water cuts announced by Zakład Usług Komunalnych w Mokrzycy (ZUK), posted
// on the gmina's site (https://www.gminalubaczow.pl, WordPress REST API).
// Grok reads each post (lib/zuk-ai.ts); here, purely, that reading becomes
// Disruptions only if every item passes our guards (lib/zuk-guards.ts) and
// resolves to our places (lib/zuk-resolve.ts). A wrong date or a widened
// place is the worst outcome and a link is always acceptable, so any doubt
// makes the whole post a Notice (lib/disruptions.ts). The cron that runs it:
// lib/zuk-cron.ts.

import { addDays } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import type { AiResult } from "./zuk-ai.ts";
import { checkItem } from "./zuk-guards.ts";
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

/** A ZUK notice of a water cut; the gmina's other posts are not read. */
export function isZukPost(post: ZukPost): boolean {
  const all = fullText(post);
  return (
    /Zakład\s+Usług\s+Komunalnych/i.test(all) &&
    /Mokrzyc/i.test(all) &&
    /przerw\p{L}*\s+w\s+dostaw\p{L}*\s+wody/iu.test(all)
  );
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
  | { status: "parsed"; items: Disruption[] }
  | { status: "notice"; reason: string };

/**
 * The model's reading of one post, checked and resolved: Disruptions only
 * if every item passes, else a Notice with the first reason.
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
  const seen = new Set<string>();
  for (const [n, item] of ai.items.entries()) {
    const why = (reason: string) => notice(`item ${n + 1}: ${reason}`);
    const checked = checkItem(item, { text, others, publishedAt, updatedAt });
    if (typeof checked === "string") return why(checked);
    const resolved = resolvePlace(
      {
        locality: item.locality,
        street: item.street,
        hamlet: checked.hamlet,
        scope: checked.scope,
      },
      places,
    );
    if (typeof resolved === "string") return why(resolved);
    for (const place of resolved.places) {
      const uid = `zuk-${post.id}-${item.date}-${place.streetId ?? place.localityId}`;
      if (seen.has(uid)) return why(`${uid} twice`);
      seen.add(uid);
      items.push({
        uid,
        kind: "water",
        cause: item.kind,
        date: item.date,
        start: checked.start,
        end: checked.end,
        endEstimated: checked.endEstimated,
        place,
        where: item.place_verbatim,
        scope: resolved.scope,
        note: item.note,
        publishedAt,
        updatedAt,
        source,
      });
    }
  }
  return { status: "parsed", items };
}

/** The Warsaw day a cut is over after: its end's, else its start's. */
const lastDay = (d: Disruption) => (d.end ?? d.start ?? d.date).slice(0, 10);

/** Cuts still to come or under way on `today` (Warsaw). */
export const current = (items: Disruption[], today: string) =>
  items.filter((d) => lastDay(d) >= today);

/** The day from which a Notice is no longer shown: 14 days after posting. */
export const noticeUntil = (publishedAt: string) =>
  addDays(publishedAt.slice(0, 10), 14);
