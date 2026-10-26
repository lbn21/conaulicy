// Water cuts announced in posts (lib/sources: the gmina's site, MZGKiM's).
// Grok reads each post (lib/zuk-ai.ts); here, purely, that reading becomes
// Disruptions through the place gate (lib/zuk-resolve.ts) and the day and
// time checks (lib/zuk-guards.ts), and each place is expanded from our
// tables alone: a district to its streets, a whole village to the village
// and its streets. An item that fails is rejected, alone, with a short
// reason (the rejected list, lib/zuk-data.ts); a day or time that fails
// makes the whole post a Notice (lib/disruptions.ts), and so does a post
// left with no item. The cron that runs it: lib/zuk-cron.ts.

import { addDays } from "./dates.ts";
import type { Disruption, DisruptionLabel, Doubt } from "./disruptions.ts";
import type { District } from "./districts.ts";
import { GMINA, type WaterSource } from "./water-sources.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import { checkWhen, noteScope, quoted, type When } from "./zuk-guards.ts";
import {
  gateItem,
  gateText,
  inPost,
  Listed,
  type Reason,
  type ZukLocality,
  type ZukPlaces,
} from "./zuk-resolve.ts";

/** Whose post it is (lib/water-sources.ts); the gmina's by default. */
export type ReadRules = { source?: WaterSource };

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

/** An item that failed, why, and where the pages link its post instead. */
export type Rejection = {
  item: AiItem;
  reason: Reason;
  /** Its locality, if listed: the post is linked on its pages. */
  localityId: string | null;
  /** The post's words for the place, if they are in the post. */
  words: string | null;
};

/** One place of an item, with its own houses and words (a district's street). */
type Placed = Pick<Disruption, "place"> & {
  label: DisruptionLabel;
  own?: Pick<Disruption, "scope" | "note" | "where">;
  /** A district's street: gives way to a place an item names itself. */
  district?: true;
};

type Gated = {
  locality: ZukLocality;
  street: ZukPlaces["streets"][number] | null;
  district: District | null;
};

/**
 * The places of a kept item, from our tables: a district its streets
 * (each whole or its stretch; the item's note limits every one), a street
 * itself, a whole place itself and every street of its own; house numbers
 * in a place with streets the place only.
 */
function itemPlaces(
  item: AiItem,
  { locality, street, district }: Gated,
  listed: Listed,
): { places: Placed[]; scope: Disruption["scope"] } | Reason {
  const scope = noteScope(item.note);
  const parent = locality.parentId
    ? (listed.byId.get(locality.parentId)?.name ?? null)
    : null;
  const at = (streetId: string | null, name: string | null): Placed => ({
    place: { localityId: locality.id, streetId },
    label: { locality: locality.name, parent, street: name },
  });
  const own = listed.data.streets.filter((s) => s.localityId === locality.id);
  if (district) {
    const places = district.streets.flatMap((s): Placed[] => {
      const known = own.find((o) => o.id === s.id);
      if (!known) return [];
      const note = item.note ?? s.part;
      return [
        {
          ...at(known.id, known.name),
          own: {
            scope: note ? { type: "unknown" } : { type: "whole" },
            note,
            where: item.street_verbatim as string,
          },
          district: true,
        },
      ];
    });
    if (places.length === 0) return "district has no streets";
    return { places, scope };
  }
  if (street) return { places: [at(street.id, street.name)], scope };
  if (own.length > 0 && (scope.type === "ranges" || scope.type === "numbers"))
    return { places: [at(null, null)], scope };
  return {
    places: [at(null, null), ...own.map((s) => at(s.id, s.name))],
    scope,
  };
}

/** The post's words for a rejected place, if they are in it. */
function rejectedWords(item: AiItem, text: string): string | null {
  const words = [item.street_verbatim, item.locality_verbatim].find(
    (w): w is string => w !== null && inPost(w, text),
  );
  return words ? words.replace(/\s+/g, " ").trim() : null;
}

type Checked =
  | { ok: true; item: AiItem; gated: Gated; when: When | null }
  | { ok: false; rejection: Rejection };

/** Each item through the gate and the day and time checks. */
function checkItems(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  rules: ReadRules,
  times: boolean,
): {
  listed: Listed;
  text: string;
  checked: Checked[];
  localityIds: string[];
} {
  const source = rules.source ?? GMINA;
  const listed = new Listed(places, source.area);
  const text = gateText(
    plainText(post.title.rendered),
    plainText(post.content.rendered),
  );
  const context = {
    text,
    publishedAt: wall(post.date),
    updatedAt: wall(post.modified),
    pieces: ai.items.flatMap(quoted),
  };
  const checked = ai.items.map((item): Checked => {
    const gated = gateItem(
      listed,
      text,
      item,
      source.implied,
      post.date.slice(0, 10),
    );
    const when = times ? checkWhen(item, context) : null;
    // A place rejected keeps its reason, but for a day out of the post's
    // window; its hours are on no line of its own to check.
    const reason = !gated.kept
      ? when === "date"
        ? when
        : gated.reason
      : typeof when === "string"
        ? when
        : null;
    if (reason === null && gated.kept)
      return { ok: true, item, gated, when: when as When | null };
    return {
      ok: false,
      rejection: {
        item,
        reason: reason as Reason,
        localityId: gated.kept
          ? gated.locality.id
          : (gated.locality?.id ?? null),
        words: rejectedWords(item, text),
      },
    };
  });
  return {
    listed,
    text,
    checked,
    localityIds: postLocalities(checked, listed),
  };
}

/**
 * What a Notice of the post may concern: every listed locality of its
 * items, passed or rejected, and of the listed names the model suggests
 * for a place off the list; no place name is looked for in the text.
 */
function postLocalities(checked: Checked[], listed: Listed): string[] {
  const ids = checked.flatMap((c) =>
    c.ok
      ? [c.gated.locality.id]
      : [
          ...(c.rejection.localityId ? [c.rejection.localityId] : []),
          ...c.rejection.item.suggested_places.flatMap((n) =>
            listed.localitiesOf(n),
          ),
        ],
  );
  return [...new Set(ids)].sort();
}

export type PostReading =
  | {
      status: "parsed";
      items: Disruption[];
      /** Items that failed, each with its reason. */
      rejected: Rejection[];
      /**
       * A bare street name the model says may mean a listed district
       * (its `doubt`): the pages say so on that district's streets.
       */
      doubts?: Doubt[];
      /** Its items' listed localities (postLocalities). */
      localityIds: string[];
    }
  | {
      status: "notice";
      reason: string;
      rejected: Rejection[];
      localityIds: string[];
    };

/**
 * The model's reading of one post, checked and resolved: Disruptions for
 * every item that passes, as long as every day and time does, else a
 * Notice with the first reason.
 */
export function readPost(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  checkedAt: string,
  rules: ReadRules = {},
): PostReading {
  let localityIds: string[] = [];
  const notice = (reason: string, rejected: Rejection[] = []): PostReading => ({
    status: "notice",
    reason,
    rejected,
    localityIds,
  });
  if (ai.post_type !== "water_outage") return notice("not an outage notice");
  if (ai.items.length === 0) return notice("no items");
  const quality = ai.items.findIndex((i) => i.kind === "quality");
  if (quality >= 0) return notice(`item ${quality + 1}: a quality item`);
  const read = checkItems(post, ai, places, rules, true);
  const { listed, text, checked } = read;
  localityIds = read.localityIds;
  const publishedAt = wall(post.date);
  const updatedAt = wall(post.modified);
  const { name, uid: prefix } = rules.source ?? GMINA;
  const source = { name, url: post.link, checkedAt };

  const rejected: Rejection[] = [];
  const failed: string[] = [];
  const items: Disruption[] = [];
  const doubts: Doubt[] = [];
  const seen = new Set<string>();
  // A district's streets come after every place an item names itself, and
  // give way to them: a street named in part is never also whole.
  const later: Disruption[] = [];
  for (const [n, c] of checked.entries()) {
    const why = (reason: string) => `item ${n + 1}: ${reason}`;
    if (!c.ok) {
      rejected.push(c.rejection);
      if (c.rejection.reason === "date" || c.rejection.reason === "time")
        failed.push(why(c.rejection.reason));
      continue;
    }
    const { item, gated } = c;
    const when = c.when as When;
    const resolved = itemPlaces(item, gated, listed);
    if (typeof resolved === "string") {
      rejected.push({
        item,
        reason: resolved,
        localityId: gated.locality.id,
        words: rejectedWords(item, text),
      });
      continue;
    }
    const doubt =
      gated.street && item.doubt !== null
        ? listed.districts.get(gated.locality.id)?.get(item.doubt)
        : undefined;
    if (doubt && doubt.streets.length > 0 && item.street_verbatim)
      doubts.push({
        words: item.street_verbatim.replace(/\s+/g, " ").trim(),
        streetIds: doubt.streets.map((s) => s.id),
      });
    for (const { label, place, own, district } of resolved.places) {
      const uid = `${prefix}-${post.id}-${item.date}-${place.streetId ?? place.localityId}`;
      const cut: Disruption = {
        uid,
        kind: "water",
        cause: item.kind === "emergency" ? "emergency" : "planned",
        date: item.date,
        ...when,
        place,
        label,
        where:
          own?.where ??
          item.street_verbatim ??
          item.locality_verbatim ??
          label.locality,
        scope: own?.scope ?? resolved.scope,
        note: own ? own.note : item.note,
        publishedAt,
        updatedAt,
        source,
      };
      if (district) {
        later.push(cut);
        continue;
      }
      if (seen.has(uid)) return notice(why(`${uid} twice`), rejected);
      seen.add(uid);
      items.push(cut);
    }
  }
  if (failed.length > 0) return notice(failed[0], rejected);
  for (const cut of later) {
    if (seen.has(cut.uid)) continue;
    seen.add(cut.uid);
    items.push(cut);
  }
  if (items.length === 0)
    return notice(
      `no place: ${rejected[0] ? rejected[0].reason : "none"}`,
      rejected,
    );
  return {
    status: "parsed",
    items,
    rejected,
    localityIds,
    ...(doubts.length > 0
      ? {
          doubts: doubts.filter(
            (d, i) => doubts.findIndex((o) => o.words === d.words) === i,
          ),
        }
      : {}),
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
  rejected: Rejection[];
  /** Its items' listed localities (postLocalities). */
  localityIds: string[];
};

/**
 * A water-quality post (boil-water, contamination, or its lifting) read by
 * the model: its places through the same gate and tables as a cut's, each
 * kept only if it passes, its day included.
 */
export function readQualityPost(
  post: ZukPost,
  ai: AiResult,
  places: ZukPlaces,
  rules: ReadRules = {},
): QualityReading {
  const { listed, text, checked, localityIds } = checkItems(
    post,
    ai,
    places,
    rules,
    false,
  );
  const out: WarningPlace[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  for (const c of checked) {
    if (!c.ok) {
      rejected.push(c.rejection);
      continue;
    }
    const resolved = itemPlaces(c.item, c.gated, listed);
    if (typeof resolved === "string") {
      rejected.push({
        item: c.item,
        reason: resolved,
        localityId: c.gated.locality.id,
        words: rejectedWords(c.item, text),
      });
      continue;
    }
    for (const { label, place, own } of resolved.places) {
      const key = place.streetId ?? place.localityId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        place,
        label,
        where:
          own?.where ??
          c.item.street_verbatim ??
          c.item.locality_verbatim ??
          label.locality,
        scope: own?.scope ?? resolved.scope,
        date: c.item.date,
      });
    }
  }
  return { status: ai.quality_status, places: out, rejected, localityIds };
}

/** The Warsaw day a cut is over after: its end's, else its start's. */
const lastDay = (d: Disruption) => (d.end ?? d.start ?? d.date).slice(0, 10);

/** Cuts still to come or under way on `today` (Warsaw). */
export const current = (items: Disruption[], today: string) =>
  items.filter((d) => lastDay(d) >= today);

/** The day from which a Notice is no longer shown: 14 days after posting. */
export const noticeUntil = (publishedAt: string) =>
  addDays(publishedAt.slice(0, 10), 14);
