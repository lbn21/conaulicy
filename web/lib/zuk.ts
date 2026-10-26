// Water cuts announced by Zakład Usług Komunalnych w Mokrzycy (ZUK), posted
// on the gmina's site (https://www.gminalubaczow.pl, WordPress REST API).
// Grok reads each post (lib/zuk-ai.ts); here, purely, that reading becomes
// Disruptions through the place gate (lib/zuk-resolve.ts) and the repo's
// stricter checks (lib/zuk-guards.ts). A wrong date or a wrong or widened place is the
// worst outcome and leaving one out is acceptable: an item whose place
// fails is dropped, alone; a day or time that fails makes the whole post a
// Notice (lib/disruptions.ts), and so does a post left with no item. The
// cron that runs it: lib/zuk-cron.ts.

import { addDays } from "./dates.ts";
import type { Disruption, DisruptionLabel } from "./disruptions.ts";
import { normalize } from "./normalize.ts";
import { GMINA, type WaterSource } from "./water-sources.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import {
  checkOmission,
  checkWhen,
  inferYear,
  noteScope,
} from "./zuk-guards.ts";
import {
  GatePlaces,
  type GateRules,
  gateItem,
  gateText,
  type Mention,
  mentions,
  type ZukPlaces,
} from "./zuk-resolve.ts";

/**
 * Whose post it is (lib/water-sources.ts: its name and uid prefix) and its
 * own gate rules (lib/zuk-resolve.ts GateRules); the gmina's by default.
 */
export type ReadRules = { source?: WaterSource; gate?: GateRules };

/** A post as the WordPress REST API returns it: the fields we read. */
export type ZukPost = {
  id: number;
  /** Site time (Warsaw), "2026-10-23T18:59:43". */
  date: string;
  modified: string;
  /**
   * A source without edit times (an RSS feed): a hash of what it gives,
   * which tells an edit instead of `modified` (lib/zuk-cron.ts).
   */
  digest?: string;
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

/** The post's title and body as plain text: what the guards check. */
export const fullText = (post: ZukPost) =>
  `${plainText(post.title.rendered)}\n${plainText(post.content.rendered)}`;

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

/** A street word right before the end: "… ul. ", "… ulica ". */
const STREET_WORD = /(?:^| )(?:ul|ulica|ulicy|ulice|al|os) $/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type PostContext = {
  data: ZukPlaces;
  places: GatePlaces;
  gate: GateRules;
  /** The post as the gate reads it, and its mentions of our places. */
  text: string;
  found: Mention[];
  items: AiItem[];
};

function postContext(
  post: ZukPost,
  ai: AiResult,
  data: ZukPlaces,
  gate: GateRules = {},
): PostContext {
  const places = new GatePlaces(data);
  const text = gateText(
    plainText(post.title.rendered),
    plainText(post.content.rendered),
  );
  return {
    data,
    places,
    gate,
    text,
    found: mentions(text, places),
    items: ai.items,
  };
}

type ItemPlaces = {
  places: Array<Pick<Disruption, "place"> & { label: DisruptionLabel }>;
  scope: Disruption["scope"];
};

/**
 * One item through the gate, then the repo's stricter place rules: with
 * no note, the place written on its own with nothing left out; the houses
 * from the note, "(przysiółek X)" the village's part X; a village-wide cut
 * is the village and every street of its own, house numbers in a village
 * with streets the village only. `date`: the gate's day check failed.
 */
function itemPlaces(
  item: AiItem,
  ctx: PostContext,
): ItemPlaces | { reason: string; date: boolean } {
  const gated = gateItem(ctx.places, ctx.text, ctx.found, item, ctx.gate);
  if (!gated.kept) return { reason: gated.reason, date: gated.date };
  const fail = (reason: string) => ({ reason, date: false });
  // The source's whole area (the gate checked the post says so): never
  // named, so neither named as a place nor written on its own.
  const wholeArea = !gated.street && gated.locality.id === ctx.gate.area;
  if (!gated.street && !wholeArea) {
    // A whole place must be named once as a place, not as a street ("ul.
    // Żuki" is not Opaka's Żuki); "przysiółek X" is a village part, never
    // the village X.
    const name = normalize(item.locality_verbatim);
    const t = ` ${normalize(ctx.text)} `;
    const asPlace = [
      ...t.matchAll(new RegExp(` ${escapeRe(name)} `, "g")),
    ].some((m) => !STREET_WORD.test(t.slice(0, m.index + 1)));
    if (!asPlace)
      return fail(`"${item.locality_verbatim}" named only as a street`);
    if (
      new RegExp(` przysiol[a-z]* ${escapeRe(name)} `).test(t) &&
      gated.locality.kind !== "czesc_wsi"
    )
      return fail(`"przysiółek ${item.locality_verbatim}" without its village`);
  }
  if (item.note === null && !wholeArea) {
    // Another place's phrase may follow this one ("Bałaje, ul. Przemysłowa
    // (Lubaczów)"); this place's own street never does.
    const others = ctx.items
      .filter((o) => o.locality !== item.locality)
      .map((o) => o.street_verbatim ?? o.locality_verbatim);
    const claimed = ctx.items
      .filter(
        (o) =>
          o !== item &&
          o.locality === item.locality &&
          o.street === item.street &&
          o.note !== null,
      )
      .map((o) => o.note as string);
    const left = checkOmission(
      item.street_verbatim ?? item.locality_verbatim,
      gated.locality.name,
      others,
      claimed,
      ctx.text,
    );
    if (left) return fail(left);
  }
  const derived = noteScope(item.note);
  if (typeof derived === "string") return fail(derived);
  const { scope, hamlet } = derived;
  let locality = gated.locality;
  if (hamlet) {
    if (gated.street) return fail(`a street and "przysiółek ${hamlet}"`);
    const parent = locality;
    const parts = ctx.data.localities.filter(
      (l) =>
        l.parentId === parent.id && normalize(l.name) === normalize(hamlet),
    );
    if (parts.length !== 1)
      return fail(`no part "${hamlet}" of ${parent.name}`);
    locality = parts[0];
  }
  const parent =
    ctx.data.localities.find((l) => l.id === locality.parentId)?.name ?? null;
  const at = (streetId: string | null, street: string | null) => ({
    place: { localityId: locality.id, streetId },
    label: { locality: locality.name, parent, street },
  });
  if (gated.street)
    return { places: [at(gated.street.id, gated.street.name)], scope };
  const own = ctx.data.streets.filter((s) => s.localityId === locality.id);
  // A village's numbering runs on across its streets, so its house numbers
  // are the village only, which its street pages show too; the town has
  // no place of its own for them.
  if (own.length > 0 && (scope.type === "ranges" || scope.type === "numbers")) {
    if (locality.kind === "miasto")
      return fail(`house numbers for ${locality.name} without a street`);
    return { places: [at(null, null)], scope };
  }
  return {
    places: [at(null, null), ...own.map((s) => at(s.id, s.name))],
    scope,
  };
}

/** The post's words for a part: "Osiedle Mazury" if so written, else its name. */
function partWords(text: string, name: string): string {
  const m = new RegExp(
    `(?:osiedl\\p{L}*|os\\.)\\s+${escapeRe(name)}(?!\\p{L})`,
    "iu",
  ).exec(text);
  return (m?.[0] ?? name).replace(/\s+/g, " ");
}

export type PostReading =
  | {
      status: "parsed";
      items: Disruption[];
      /** Items whose place failed, with the reason. */
      dropped: string[];
      /**
       * A source with an area (GateRules): the post's own words for each
       * place in it we could not match ("Osiedle domów … ul.
       * Niemirowskiej") or matched only to a part of the area ("Osiedle
       * Mazury"), so the area's pages link the post; never empty.
       */
      unmatched?: string[];
    }
  | { status: "notice"; reason: string };

/**
 * The model's reading of one post, checked and resolved: Disruptions for
 * every item whose place passes, as long as every day and time does, else
 * a Notice with the first reason. A day written without its year takes
 * the post's (inferYear).
 */
export function readPost(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  checkedAt: string,
  rules: ReadRules = {},
): PostReading {
  const notice = (reason: string): PostReading => ({
    status: "notice",
    reason,
  });
  if (ai.post_type !== "water_outage") return notice("not an outage notice");
  if (ai.items.length === 0) return notice("no items");
  const ctx = postContext(post, ai, places, rules.gate);
  const text = fullText(post);
  const publishedAt = wall(post.date);
  const updatedAt = wall(post.modified);
  const { name, uid: prefix } = rules.source ?? GMINA;
  const source = { name, url: post.link, checkedAt };
  const literal = normalize(ctx.text);

  const items: Disruption[] = [];
  const dropped: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const [n, read] of ai.items.entries()) {
    const why = (reason: string) => `item ${n + 1}: ${reason}`;
    const item = { ...read, date: inferYear(read.date, text, publishedAt) };
    if (item.kind === "quality") return notice(why("a quality item"));
    const resolved = itemPlaces(item, ctx);
    if ("reason" in resolved && resolved.date)
      return notice(why(resolved.reason));
    const when = checkWhen(item, { text, publishedAt, updatedAt });
    if (typeof when === "string") return notice(why(when));
    if ("reason" in resolved) {
      dropped.push(why(resolved.reason));
      const words = item.street_verbatim ?? item.note ?? item.locality_verbatim;
      if (rules.gate?.area && literal.includes(normalize(words)))
        unmatched.push(words.replace(/\s+/g, " ").trim());
      continue;
    }
    // A part of the area (a TERYT part of the town, "Osiedle Mazury") may
    // have no address of its own, so no page: its cut stays, and its words
    // are linked on the area's other pages too, never lost.
    const [first] = resolved.places;
    if (
      rules.gate?.area &&
      first.place.streetId === null &&
      first.place.localityId !== rules.gate.area
    )
      unmatched.push(partWords(ctx.text, item.locality_verbatim));
    for (const { label, place } of resolved.places) {
      const uid = `${prefix}-${post.id}-${item.date}-${place.streetId ?? place.localityId}`;
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
        where: item.street_verbatim ?? item.locality_verbatim,
        scope: resolved.scope,
        note: item.note,
        publishedAt,
        updatedAt,
        source,
      });
    }
  }
  if (items.length === 0) return notice(`no place: ${dropped[0]}`);
  return {
    status: "parsed",
    items,
    dropped,
    ...(unmatched.length > 0 ? { unmatched: [...new Set(unmatched)] } : {}),
  };
}

/** A place a water-quality warning concerns: ours, with the source's words. */
export type WarningPlace = Pick<Disruption, "place" | "where" | "scope"> & {
  label: DisruptionLabel;
  /** YYYY-MM-DD, written in the post: the warning starts, or ends if lifted. */
  date: string;
};

export type QualityReading = {
  status: "warning" | "lifted" | null;
  places: WarningPlace[];
  /** Items whose place or day failed, with the reason. */
  dropped: string[];
};

/**
 * A water-quality post (boil-water, contamination, or its lifting) read by
 * the model: its places through the same gate and rules as a cut's, each
 * kept only if it passes, its day included. No place passing: no places.
 */
export function readQualityPost(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  rules: ReadRules = {},
): QualityReading {
  const ctx = postContext(post, ai, places, rules.gate);
  const out: WarningPlace[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const [n, item] of ai.items.entries()) {
    const resolved = itemPlaces(item, ctx);
    if ("reason" in resolved) {
      dropped.push(`item ${n + 1}: ${resolved.reason}`);
      continue;
    }
    for (const { label, place } of resolved.places) {
      const key = place.streetId ?? place.localityId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        place,
        label,
        where: item.street_verbatim ?? item.locality_verbatim,
        scope: resolved.scope,
        date: item.date,
      });
    }
  }
  return { status: ai.quality_status, places: out, dropped };
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
