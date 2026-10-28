// A source's water file in Vercel Blob (private store, one per source,
// lib/water-sources.ts pathname, "zuk/disruptions.json" the gmina's): what
// the cron (lib/zuk-cron.ts) writes and the pages read (lib/zuk-store.ts).
// Every source's file has this one shape. Pure, so the tests run it as is.
//
// {
//   version: 5,
//   generatedAt,  // ISO: when `active` or `seen` last changed, any
//                 // checkedAt in them aside
//   checkedAt,    // ISO: the last successful read of the source's posts
//   gazetteer,    // a short hash of the district rows the posts were
//                 // read with, null if none were loaded yet
//   active: [{    // the water posts that still matter: all the pages read
//     id, modified, reader, url, title, publishedAt, updatedAt,
//     status: "parsed" | "notice",
//     reason?,            // why a Notice: the post could not be read
//                         // (shown for 14 days), or "water-quality" (no
//                         // UI yet, never shown)
//     past?, change?,     // a report of a past cut; a post moving an
//                         // earlier one's dates (the model's
//                         // changes_earlier_dates)
//     localityIds,        // what a Notice may concern
//     itemCount,          // items read, before those already over went
//     items: Disruption[] // parsed only; cuts already over are dropped
//     sourceId,           // lib/sources: "gmina-lubaczow", "mzgkim"
//     qualityStatus?, places?  // "water-quality" only: warning or lifted,
//                         // the places that passed the gate, each its day
//     unmatched?,         // its rejected items: their words, if in the
//                         // post, and locality, if listed (lib/zuk.ts)
//     doubts?,            // bare names read as a street that may mean a
//                         // district, with that district's streets
//     digest?,            // a source without edit times: what changed
//   }],
//   seen: [{      // the cron's memory of every other post it decided
//     id, modified, reader, digest?,
//     reason,     // "not-water" (the model's post_type "other"), "past"
//                 // (its cuts are over), "expired" (a Notice past its 14
//                 // days), "ai-unavailable" (retried next run)
//   }],
//   rejected: [{  // for review, never read by the pages: every item of a
//                 // post in the window that failed the gate
//     postId, url, sourceId, publishedAt, readAt,
//     item,       // the model's JSON as returned
//     reason,     // lib/zuk-resolve.ts Reason: "street not listed", …
//     suggested_places, // the model's, listed names only
//   }],
//   retries: [{   // posts whose reply was not the schema: tried
//     postId, reader, modified, digest?, attempts, retryAt
//                 // after 1 h, then 6 h; the third failure: given up,
//                 // retryAt null, on `rejected` as "invalid reply"
//   }]
// }
//
// A post over the run's model calls is in neither: read on a later run.
// A post is read again when it is edited, its reading failed, its
// `reader` is older than ZUK_READER, or it has rejected items and the
// districts changed (`gazetteer`). A file of an older version (1-4) is
// no file: the pages show the source link and the cron reads the window
// afresh. The version is the file's shape; the reader is what read it.

import { todayInWarsaw } from "./dates.ts";
import type { Disruption, Doubt, Notice } from "./disruptions.ts";
import { GMINA, type WaterSource } from "./water-sources.ts";
import { current, noticeUntil, notOver, type WarningPlace } from "./zuk.ts";
import type { AiItem } from "./zuk-ai.ts";
import type { Reason } from "./zuk-resolve.ts";

export const ZUK_FILE_VERSION = 5;
/**
 * What reads a post: the prompt, schema and place gate. 3 is v3.1 (task
 * 114b), 4 the omission guard per dated line (task 152), 5 the town's
 * districts (the gazetteer, task 151), 6 the shared prompt and the gate of
 * certain checks only (task 182), 7 its rules' revision 2, 8 rules
 * revision 5, reasoning medium and the publish day (task 184c), 9
 * date_verbatim and houses, a literal day and house gate (task 186), 10
 * rules-rev8c, the note without the joining dash (task 189); raise it when
 * they change (the prompt is not part of the key), and every post is read
 * again.
 */
export const ZUK_READER = 10;

/** Older than this, the data may be out of date: show the source link. */
export const STALE_MS = 60 * 60_000;

/** The model could not read the post (xAI failed or no key): retried. */
export const AI_UNAVAILABLE = "ai-unavailable";
/** Over the run's model calls: not stored, read next run. */
export const AI_DEFERRED = "ai-deferred";
/** Its cuts are all over. */
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
  /** Its rejected items: linked on their locality's pages, else the post's. */
  unmatched?: Unmatched[];
  /** A bare name read as the street, which may mean a district (lib/zuk.ts). */
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

/** A rejected item as the pages link it. */
export type Unmatched = { words: string | null; localityId: string | null };

/** The reason of a post the model never answered in the schema. */
export const INVALID_REPLY = "invalid reply";

/** An item that failed the gate, for review (never shown). */
export type RejectedEntry = {
  postId: number;
  url: string;
  sourceId: string;
  publishedAt: string;
  /** The run that read it (ISO). */
  readAt: string;
  /** The model's item as returned; null for an invalid reply. */
  item: AiItem | null;
  reason: Reason | typeof INVALID_REPLY;
  suggested_places: string[];
  /** An invalid reply: its first 2,000 characters. */
  raw?: string;
};

/**
 * A post whose reply was not the schema, by reader and version
 * (`modified`, `digest`): tried `attempts` times, next not before
 * `retryAt`; null: given up (on the rejected list).
 */
export type Retry = {
  postId: number;
  reader: number;
  modified: string;
  digest?: string;
  attempts: number;
  retryAt: string | null;
};

export type ZukFile = {
  version: typeof ZUK_FILE_VERSION;
  generatedAt: string;
  checkedAt: string;
  gazetteer: string | null;
  active: StoredPost[];
  seen: SeenPost[];
  rejected: RejectedEntry[];
  retries: Retry[];
};

/** The file, or null if it is not one of this version. */
export function parseZukFile(body: string): ZukFile | null {
  try {
    const file = JSON.parse(body) as ZukFile;
    return file?.version === ZUK_FILE_VERSION &&
      typeof file.checkedAt === "string" &&
      (file.gazetteer === null || typeof file.gazetteer === "string") &&
      Array.isArray(file.active) &&
      Array.isArray(file.seen) &&
      Array.isArray(file.rejected) &&
      Array.isArray(file.retries)
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

/**
 * The cuts of posts published before `change` that it may move or cancel:
 * those still to come at a place it gives (its street; a whole place, any
 * cut of that locality). A change post that gave no cut at all (a
 * cancellation) reaches every cut of its localities.
 */
function changedCuts(change: StoredPost, posts: StoredPost[]): Disruption[] {
  const own = change.itemCount > 0;
  const streets = new Set(
    change.items.flatMap((d) => (d.place.streetId ? [d.place.streetId] : [])),
  );
  const localities = new Set(
    own
      ? change.items
          .filter((d) => d.place.streetId === null)
          .map((d) => d.place.localityId)
      : change.localityIds,
  );
  return posts
    .filter((post) => post.publishedAt < change.publishedAt)
    .flatMap((post) =>
      post.items.filter(
        (d) =>
          localities.has(d.place.localityId) ||
          (d.place.streetId !== null && streets.has(d.place.streetId)),
      ),
    );
}

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
      (p.change && water(p) && changedCuts(p, parsed).length > 0)
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
 * What must not be shown as dates: the posts of two that give one place
 * and day different hours (`posts`), and the cuts a later post may move
 * (`cuts`, changedCuts).
 */
function doubted(posts: StoredPost[]): {
  posts: Set<number>;
  cuts: Set<string>;
} {
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
  const cuts = new Set(
    posts
      .filter((p) => p.change)
      .flatMap((change) => changedCuts(change, posts).map((d) => d.uid)),
  );
  return { posts: out, cuts };
}

/**
 * What the pages get from `source`'s file at `now` (never its `rejected`).
 * A post with rejected items gives a Notice too, naming their words
 * (`where`): on their locality's pages, else on the post's; the pages
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
  const notice = (post: StoredPost, suffix: string | null = null): Notice => ({
    uid: `${source.uid}-${post.id}${suffix ? `-${suffix}` : ""}`,
    kind: "water",
    title: post.title,
    localityIds: post.localityIds,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    source: from(post),
    ...(suffix === "doubt" ? { doubt: post.doubts } : {}),
  });
  // One Notice per locality of the rejected items; those with none on the
  // post's localities.
  const rest = (post: StoredPost): Notice[] => {
    const groups = new Map<string | null, string[]>();
    for (const u of post.unmatched ?? [])
      groups.set(u.localityId, [
        ...(groups.get(u.localityId) ?? []),
        ...(u.words === null ? [] : [u.words]),
      ]);
    return [...groups].map(([id, words]) => ({
      ...notice(post, id === null ? "rest" : `rest-${id}`),
      ...(id === null ? {} : { localityIds: [id] }),
      where: [...new Set(words)],
    }));
  };
  const posts = file.active
    .filter((p) => !HIDDEN.has(p.reason ?? ""))
    .map((p) => ({ ...p, items: notOver(p.items, now) }));
  const doubt = doubted(posts);
  const disruptions: Disruption[] = [];
  const notices: Notice[] = [];
  for (const post of posts) {
    if (post.status === "parsed" && !doubt.posts.has(post.id)) {
      // Its cuts a later post may move: a link on their localities only.
      const moved = post.items.filter((d) => doubt.cuts.has(d.uid));
      if (moved.length > 0)
        notices.push({
          ...notice(post, "changed"),
          localityIds: [...new Set(moved.map((d) => d.place.localityId))],
        });
      disruptions.push(
        ...post.items
          .filter((d) => !doubt.cuts.has(d.uid))
          .map((d) => ({ ...d, source: from(post) })),
      );
      if (post.items.length > 0) notices.push(...rest(post));
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
