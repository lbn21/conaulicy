// The ZUK file in Vercel Blob (private store, pathname ZUK_PATHNAME): what
// the cron (lib/zuk-cron.ts) writes and the pages read (lib/zuk-store.ts).
// Pure, so the tests run it as is.
//
// {
//   version: 1,
//   generatedAt,  // ISO: when `posts` last changed
//   checkedAt,    // ISO: the last successful read of the gmina's posts
//   posts: [{
//     id, modified, url, title, publishedAt, updatedAt,
//     status: "parsed" | "notice",
//     reason?,            // why a Notice ("ai-unavailable" is retried)
//     past?, change?,     // a report of a past cut; a date-change post
//     localityIds,        // what a Notice may concern
//     model?, usage?, costUsd?,  // the reading that produced it
//     items: Disruption[] // parsed only; cuts already over are dropped
//   }]
// }

import { todayInWarsaw } from "./dates.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import { current, noticeUntil, SOURCE_NAME } from "./zuk.ts";
import type { AiUsage } from "./zuk-ai.ts";

export const ZUK_PATHNAME = "zuk/disruptions.json";
export const ZUK_FILE_VERSION = 1;

/** Older than this, the data may be out of date: show the source link. */
export const STALE_MS = 60 * 60_000;

/** A Notice for a post the model could not read; retried every run. */
export const AI_UNAVAILABLE = "ai-unavailable";

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
  items: Disruption[];
};

export type ZukFile = {
  version: typeof ZUK_FILE_VERSION;
  generatedAt: string;
  checkedAt: string;
  posts: StoredPost[];
};

/** The file, or null if it is not one we wrote. */
export function parseZukFile(body: string): ZukFile | null {
  try {
    const file = JSON.parse(body) as ZukFile;
    return file?.version === ZUK_FILE_VERSION &&
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
  const posts = file.posts.map((p) => ({
    ...p,
    items: current(p.items, today),
  }));
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
        : today < noticeUntil(post.publishedAt);
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
