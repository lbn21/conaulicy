// The ZUK file in Vercel Blob (private store, pathname ZUK_PATHNAME): what
// the cron (lib/zuk-cron.ts) writes and the pages read (lib/zuk-store.ts).
// Pure, so the tests run it as is.
//
// {
//   version: 3,
//   generatedAt,  // ISO: when `posts` last changed
//   checkedAt,    // ISO: the last successful read of the gmina's posts
//   posts: [{
//     id, modified, url, title, publishedAt, updatedAt,
//     status: "parsed" | "notice",
//     reason?,            // why a Notice: "past" (not read), or retried
//                         // next run: "ai-deferred" (the run's cap),
//                         // "ai-unavailable" (xAI failed or no key);
//                         // never shown: "not-water" (the model's
//                         // post_type "other"), "water-quality" (no UI yet)
//     past?, change?,     // a report of a past cut; a date-change post
//     localityIds,        // what a Notice may concern
//     model?, usage?, costUsd?,  // the reading that produced it
//     itemCount,          // items read, before those already over went
//     items: Disruption[] // parsed only; cuts already over are dropped
//     sourceId?,          // lib/sources: "gmina-lubaczow"
//     qualityStatus?, places?  // "water-quality" only: warning or lifted,
//                         // the places that passed the gate, each its day
//   }]
// }
//
// Older versions are still read: the pages show them as they are, and the
// cron reads every post again. Version 1: no itemCount, no item label.
// Version 2: read with the v1 prompt and gate (place_verbatim); its first
// files hold only keyword-filtered posts. Version 3 (task 114b): the v3.1
// prompt and gate, `where` the post's own street or locality and the
// houses in `note`.

import { todayInWarsaw } from "./dates.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import { current, noticeUntil, SOURCE_NAME, type WarningPlace } from "./zuk.ts";
import type { AiUsage } from "./zuk-ai.ts";

export const ZUK_PATHNAME = "zuk/disruptions.json";
export const ZUK_FILE_VERSION = 3;

/** Older than this, the data may be out of date: show the source link. */
export const STALE_MS = 60 * 60_000;

/** A Notice for a post the model could not read; retried every run. */
export const AI_UNAVAILABLE = "ai-unavailable";
/** A Notice for a post over the run's model calls; retried next run. */
export const AI_DEFERRED = "ai-deferred";
/** A Notice for a post whose title's days are all over: never read. */
export const PAST = "past";
/** A Notice for a post the model says is not about water: never shown. */
export const NOT_WATER = "not-water";
/** A Notice for a water-quality warning: kept, not shown yet. */
export const WATER_QUALITY = "water-quality";
/** Posts the pages never get, not even for a clash or a date change. */
const HIDDEN = new Set([NOT_WATER, WATER_QUALITY]);

export type StoredPost = {
  id: number;
  modified: string;
  url: string;
  title: string;
  publishedAt: string;
  updatedAt: string;
  status: "parsed" | "notice";
  reason?: string;
  past?: boolean;
  change?: boolean;
  localityIds: string[];
  model?: string;
  usage?: AiUsage;
  costUsd?: number;
  /** Absent in version 1. */
  itemCount?: number;
  items: Disruption[];
  /** The source it came from (lib/sources); absent before task 114. */
  sourceId?: string;
  /** "water-quality" only. */
  qualityStatus?: "warning" | "lifted" | null;
  places?: WarningPlace[];
};

export type ZukFile = {
  version: typeof ZUK_FILE_VERSION | 2 | 1;
  generatedAt: string;
  checkedAt: string;
  posts: StoredPost[];
};

/** The file, or null if it is not one we wrote. */
export function parseZukFile(body: string): ZukFile | null {
  try {
    const file = JSON.parse(body) as ZukFile;
    return [ZUK_FILE_VERSION, 2, 1].includes(file?.version) &&
      typeof file.checkedAt === "string" &&
      Array.isArray(file.posts)
      ? file
      : null;
  } catch {
    return null;
  }
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
  for (const change of posts.filter((p) => p.change)) {
    const touched = new Set([
      ...change.localityIds,
      ...change.items.map((d) => d.place.localityId),
    ]);
    for (const post of posts)
      if (
        post.publishedAt < change.publishedAt &&
        post.items.some((d) => touched.has(d.place.localityId))
      )
        out.add(post.id);
  }
  return out;
}

/** What the pages get from the file at `now`. */
export function zukView(file: ZukFile | null, now: Date): ZukData {
  if (!file)
    return {
      disruptions: [],
      notices: [],
      unavailable: true,
      stale: true,
      checkedAt: null,
    };
  const today = todayInWarsaw(now);
  const source = (post: StoredPost) => ({
    name: SOURCE_NAME,
    url: post.url,
    checkedAt: file.checkedAt,
  });
  const posts = file.posts
    .filter((p) => !HIDDEN.has(p.reason ?? ""))
    .map((p) => ({ ...p, items: current(p.items, today) }));
  const doubt = doubted(posts);
  const disruptions: Disruption[] = [];
  const notices: Notice[] = [];
  for (const post of posts) {
    if (post.status === "parsed" && !doubt.has(post.id)) {
      disruptions.push(
        ...post.items.map((d) => ({ ...d, source: source(post) })),
      );
      continue;
    }
    const shown =
      post.status === "parsed"
        ? post.items.length > 0
        : post.reason !== PAST && today < noticeUntil(post.publishedAt);
    if (!shown) continue;
    notices.push({
      uid: `zuk-${post.id}`,
      kind: "water",
      title: post.title,
      localityIds: post.localityIds,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      source: source(post),
    });
  }
  return {
    disruptions,
    notices,
    unavailable: false,
    stale: now.getTime() - Date.parse(file.checkedAt) > STALE_MS,
    checkedAt: file.checkedAt,
  };
}
