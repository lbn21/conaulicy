// A source's water file in Vercel Blob (private store, one per source,
// lib/water-sources.ts pathname, "zuk/disruptions.json" the gmina's): what
// the cron (lib/zuk-cron.ts) writes and the pages read (lib/zuk-store.ts).
// Every source's file has this one shape. Pure, so the tests run it as is.
//
// {
//   version: 4,
//   generatedAt,  // ISO: when `active` or `seen` last changed, any
//                 // checkedAt in them aside
//   checkedAt,    // ISO: the last successful read of the gmina's posts
//   active: [{    // the water posts that still matter: all the pages read
//     id, modified, reader, url, title, publishedAt, updatedAt,
//     status: "parsed" | "notice",
//     reason?,            // why a Notice: the post could not be read
//                         // (shown for 14 days), or "water-quality" (no
//                         // UI yet, never shown)
//     past?, change?,     // a report of a past cut; a date-change post
//     localityIds,        // what a Notice may concern
//     itemCount,          // items read, before those already over went
//     items: Disruption[] // parsed only; cuts already over are dropped
//     sourceId,           // lib/sources: "gmina-lubaczow", "mzgkim"
//     qualityStatus?, places?  // "water-quality" only: warning or lifted,
//                         // the places that passed the gate, each its day
//     unmatched?,         // a source with an area: the post's words for
//                         // places in it we could not match (lib/zuk.ts)
//     doubts?,            // and bare names read as a street that may mean
//                         // the estate of that name ("Mazury"), with
//                         // that estate's streets
//     digest?,            // a source without edit times: what changed
//   }],
//   seen: [{      // the cron's memory of every other post it decided
//     id, modified, reader, digest?,
//     reason,     // "not-water" (the model's post_type "other"), "past"
//                 // (its days or cuts are over), "expired" (a Notice
//                 // past its 14 days), "ai-unavailable" (retried next run)
//   }]
// }
//
// A post over the run's model calls is in neither: read on a later run.
// A post is read again when it is edited, its reading failed, or its
// `reader` is older than ZUK_READER. A file of an older version (1-3) is
// no file: the pages show the source link and the cron reads the window
// afresh. The version is the file's shape; the reader is what read it.

import { todayInWarsaw } from "./dates.ts";
import type { Disruption, Doubt, Notice } from "./disruptions.ts";
import { GMINA, type WaterSource } from "./water-sources.ts";
import { current, noticeUntil, type WarningPlace } from "./zuk.ts";

export const ZUK_FILE_VERSION = 4;
/**
 * What reads a post: the prompt, schema and place gate. 3 is v3.1 (task
 * 114b), 4 the omission guard per dated line (task 152), 5 the town's
 * districts (the gazetteer, task 151); raise it when they change, and
 * every post is read again.
 */
export const ZUK_READER = 5;

/** Older than this, the data may be out of date: show the source link. */
export const STALE_MS = 60 * 60_000;

/** The model could not read the post (xAI failed or no key): retried. */
export const AI_UNAVAILABLE = "ai-unavailable";
/** Over the run's model calls: not stored, read next run. */
export const AI_DEFERRED = "ai-deferred";
/** Its title's days or its cuts are all over. */
export const PAST = "past";
/** A Notice past its 14 days (noticeUntil). */
export const EXPIRED = "expired";
/** The model says it is not about water: never shown. */
export const NOT_WATER = "not-water";
/** A water-quality warning: kept, not shown yet. */
export const WATER_QUALITY = "water-quality";
/** Posts the pages never get, not even for a clash or a date change. */
const HIDDEN = new Set([NOT_WATER, WATER_QUALITY, AI_UNAVAILABLE, AI_DEFERRED]);

export type StoredPost = {
  id: number;
  modified: string;
  reader: number;
  url: string;
  title: string;
  publishedAt: string;
  updatedAt: string;
  status: "parsed" | "notice";
  reason?: string;
  past?: boolean;
  change?: boolean;
  localityIds: string[];
  itemCount: number;
  items: Disruption[];
  /** The source it came from (lib/sources). */
  sourceId: string;
  /** "water-quality" only. */
  qualityStatus?: "warning" | "lifted" | null;
  places?: WarningPlace[];
  /** Places in the source's area we could not match, as written. */
  unmatched?: string[];
  /** A bare name read as the street, which may mean the estate (lib/zuk.ts). */
  doubts?: Doubt[];
  /** lib/zuk.ts ZukPost digest. */
  digest?: string;
};

/** A post decided and not active: only what the cron needs. */
export type SeenPost = {
  id: number;
  modified: string;
  reason: string;
  reader: number;
  digest?: string;
};

export type ZukFile = {
  version: typeof ZUK_FILE_VERSION;
  generatedAt: string;
  checkedAt: string;
  active: StoredPost[];
  seen: SeenPost[];
};

/** The file, or null if it is not one of this version. */
export function parseZukFile(body: string): ZukFile | null {
  try {
    const file = JSON.parse(body) as ZukFile;
    return file?.version === ZUK_FILE_VERSION &&
      typeof file.checkedAt === "string" &&
      Array.isArray(file.active) &&
      Array.isArray(file.seen)
      ? file
      : null;
  } catch {
    return null;
  }
}

const seenAs = (post: StoredPost, reason: string): SeenPost => ({
  id: post.id,
  modified: post.modified,
  reason,
  reader: post.reader,
  ...(post.digest === undefined ? {} : { digest: post.digest }),
});

/** Posts published before `change` with a cut in a locality it touches. */
const changed = (change: StoredPost, posts: StoredPost[]) => {
  const localities = new Set([
    ...change.localityIds,
    ...change.items.map((d) => d.place.localityId),
  ]);
  return posts.filter(
    (post) =>
      post.publishedAt < change.publishedAt &&
      post.items.some((d) => localities.has(d.place.localityId)),
  );
};

/**
 * Where each post goes on `today`: `active` if the pages may still use it
 * (cuts to come, a Notice within its 14 days, a water-quality warning, a
 * date-change post doubting an active one), else `seen`. A post over the
 * run's cap (AI_DEFERRED) goes nowhere.
 */
export function settle(
  posts: Array<StoredPost | SeenPost>,
  today: string,
): Pick<ZukFile, "active" | "seen"> {
  const full = posts
    .filter((p): p is StoredPost => "status" in p)
    .map((p) => ({ ...p, items: current(p.items, today) }));
  const water = (p: StoredPost) =>
    !HIDDEN.has(p.reason ?? "") && p.reason !== PAST;
  const live = full.filter(
    (p) =>
      p.reason === WATER_QUALITY ||
      (water(p) &&
        (p.status === "parsed"
          ? p.items.length > 0
          : today < noticeUntil(p.publishedAt))),
  );
  const parsed = live.filter((p) => p.status === "parsed");
  const active: StoredPost[] = [];
  const seen: SeenPost[] = [];
  for (const post of posts) {
    if (!("status" in post)) {
      seen.push(post);
      continue;
    }
    const p = full.find((f) => f.id === post.id) as StoredPost;
    if (p.reason === AI_DEFERRED) continue;
    if (
      live.includes(p) ||
      (p.change && water(p) && changed(p, parsed).length > 0)
    )
      active.push(p);
    else if ([NOT_WATER, AI_UNAVAILABLE, PAST].includes(p.reason ?? ""))
      seen.push(seenAs(p, p.reason as string));
    else seen.push(seenAs(p, p.status === "parsed" ? PAST : EXPIRED));
  }
  return { active, seen };
}

export type ZukData = {
  disruptions: Disruption[];
  notices: Notice[];
  /** No file, or an unreadable one: the source could not be read. */
  unavailable: boolean;
  /** Unavailable, or last checked more than STALE_MS ago. */
  stale: boolean;
  checkedAt: string | null;
};

const dayAndPlace = (d: Disruption) =>
  `${d.date}|${d.place.streetId ?? d.place.localityId}`;

/**
 * Posts whose cuts must not be shown as dates: two posts giving one place
 * and day different hours, and earlier posts sharing a locality with a
 * later date-change post ("aktualizacja dat").
 */
function doubted(posts: StoredPost[]): Set<number> {
  const out = new Set<number>();
  const hours = new Map<string, Map<string, number[]>>();
  for (const post of posts) {
    for (const d of post.items) {
      const byHours = hours.get(dayAndPlace(d)) ?? new Map();
      const key = `${d.start}-${d.end}`;
      byHours.set(key, [...(byHours.get(key) ?? []), post.id]);
      hours.set(dayAndPlace(d), byHours);
    }
  }
  for (const byHours of hours.values())
    if (byHours.size > 1)
      for (const ids of byHours.values()) for (const id of ids) out.add(id);
  for (const change of posts.filter((p) => p.change))
    for (const post of changed(change, posts)) out.add(post.id);
  return out;
}

/**
 * What the pages get from `source`'s file at `now`. A post with places we
 * could not match gives a Notice too, naming them (`where`): the pages
 * link it where none of its cuts is shown (lib/water-module.ts).
 */
export function zukView(
  file: ZukFile | null,
  now: Date,
  source: WaterSource = GMINA,
): ZukData {
  if (!file)
    return {
      disruptions: [],
      notices: [],
      unavailable: true,
      stale: true,
      checkedAt: null,
    };
  const today = todayInWarsaw(now);
  const from = (post: StoredPost) => ({
    name: source.name,
    url: post.url,
    checkedAt: file.checkedAt,
  });
  const notice = (
    post: StoredPost,
    rest: "rest" | "doubt" | null = null,
  ): Notice => ({
    uid: `${source.uid}-${post.id}${rest ? `-${rest}` : ""}`,
    kind: "water",
    title: post.title,
    localityIds: post.localityIds,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    source: from(post),
    ...(rest === "rest" ? { where: post.unmatched } : {}),
    ...(rest === "doubt" ? { doubt: post.doubts } : {}),
  });
  const posts = file.active
    .filter((p) => !HIDDEN.has(p.reason ?? ""))
    .map((p) => ({ ...p, items: current(p.items, today) }));
  const doubt = doubted(posts);
  const disruptions: Disruption[] = [];
  const notices: Notice[] = [];
  for (const post of posts) {
    if (post.status === "parsed" && !doubt.has(post.id)) {
      disruptions.push(
        ...post.items.map((d) => ({ ...d, source: from(post) })),
      );
      if (post.items.length > 0 && post.unmatched?.length)
        notices.push(notice(post, "rest"));
      if (post.items.length > 0 && post.doubts?.length)
        notices.push(notice(post, "doubt"));
      continue;
    }
    const shown =
      post.status === "parsed"
        ? post.items.length > 0
        : post.reason !== PAST && today < noticeUntil(post.publishedAt);
    if (!shown) continue;
    notices.push(notice(post));
  }
  return {
    disruptions,
    notices,
    unavailable: false,
    stale: now.getTime() - Date.parse(file.checkedAt) > STALE_MS,
    checkedAt: file.checkedAt,
  };
}
