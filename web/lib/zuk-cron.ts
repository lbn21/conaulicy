// The water cron (app/api/cron/zuk/route.ts, every 15 minutes): reads a
// source's recent posts, has the model read every post that is new,
// edited, read by an older reader (ZUK_READER) or whose last reading
// failed, and every post with rejected items when the districts changed
// (the gazetteer hash); keeps every other post's stored result, and writes
// the file (lib/zuk-data.ts) on every run that read the posts: checkedAt
// is that run, generatedAt the last run that changed what the pages read
// (any checkedAt aside, the rejected list too); only such a run purges the
// WATER cache tag (deps.purge), never DATASET. The model reads every post
// and says what it is: a water cut is read for its cuts, a water-quality
// warning for its places (not shown yet), anything else is "not-water",
// never read again. Only the water posts that still matter are `active`;
// the rest is a slim `seen` record. Every item that fails the gate goes to
// the `rejected` list, rebuilt each run from the posts in the window and
// logged. The source's site down: the old file stays, unchanged, and turns
// stale. xAI down: new and edited posts are retried next run, never shown;
// so are those over the run's cap. A post read before keeps that reading
// until it is read again. A file of an older version: no file, every post
// is read afresh. Dependencies come in, so the tests mock them.
//
// One run reads one source (lib/sources) into its own file; the route runs
// every source in turn (handleZukCron), each failing on its own: the
// gmina's posts first, then MZGKiM's. A source that gives only a summary
// (MZGKiM's feed) has each post's page fetched right before the model
// reads it; a source without edit times tells an edit by its digest.

import { createHash } from "node:crypto";
import { addDays, isoWithOffset, todayInWarsaw } from "./dates.ts";
import type { District } from "./districts.ts";
import { NO_STORE, WATER } from "./headers.ts";
import { cronDenied } from "./secret.ts";
import { gminaLubaczow } from "./sources/gmina-lubaczow/index.ts";
import { type PostSource, SourceDown } from "./sources/source.ts";
import {
  mentionedLocalities,
  plainText,
  type Rejection,
  readPost,
  readQualityPost,
  wall,
  type ZukPost,
} from "./zuk.ts";
import { type AiReading, readWithAi } from "./zuk-ai.ts";
import {
  AI_UNAVAILABLE,
  NOT_WATER,
  parseZukFile,
  type RejectedEntry,
  type SeenPost,
  type StoredPost,
  settle,
  type Unmatched,
  WATER_QUALITY,
  ZUK_FILE_VERSION,
  ZUK_READER,
  type ZukFile,
} from "./zuk-data.ts";
import { Listed, type ZukPlaces } from "./zuk-resolve.ts";

/**
 * Posts published in the last this many days are read. In 18 months of
 * the gmina's posts (54 outage posts), an outage was announced 0-4 days
 * ahead and its last day was at most 6 days after the post.
 */
const WINDOW_DAYS = 14;
/** At most this many model calls per run; the rest wait for the next. */
const MAX_AI_CALLS = 4;
/** No new model call after this long into the run (maxDuration 300 s). */
const AI_BUDGET_MS = 200_000;

export type ZukCronDeps = {
  fetch: typeof fetch;
  /** The file's body, or null if there is none yet. Throws if unreadable. */
  readFile: () => Promise<string | null>;
  writeFile: (body: string) => Promise<void>;
  /** Drops a cache tag's data cache and CDN copies: revalidateTag. */
  purge: (tag: string) => void;
  places: () => Promise<ZukPlaces>;
  readAi?: typeof readWithAi;
  /** Whose posts: lib/sources; the gmina's by default. */
  source?: PostSource;
  xaiKey: string | undefined;
  now: () => Date;
  /** When the model-call budget started: the route's start; else the run's. */
  since?: Date;
  log: (line: Record<string, unknown>) => void;
};

export type RunSummary = {
  posts: number;
  active: number;
  aiCalls: number;
  costUsd: number;
  /** The file's content changed (generatedAt moved, WATER purged). */
  changed: boolean;
};

/**
 * What the pages show, as a string to compare: every checkedAt left out (a
 * post read again with the same result changes only its items' time).
 */
function content(active: StoredPost[], seen: SeenPost[]): string {
  return JSON.stringify([active, seen], (key, value) =>
    key === "checkedAt" ? undefined : value,
  );
}

/** Whether the post changed since it was decided: its digest, else `modified`. */
const edited = (post: ZukPost, old: StoredPost | SeenPost) =>
  post.digest === undefined
    ? old.modified !== post.modified
    : old.digest !== post.digest;

/**
 * The post's last change: its own `modified`; for a source without edit
 * times, the run that first saw its digest (the first: its publication).
 */
function lastChange(
  post: ZukPost,
  old: StoredPost | SeenPost | undefined,
  checkedAt: string,
): string {
  if (post.digest === undefined || !old) return post.modified;
  if (old.digest === post.digest) return old.modified;
  return isoWithOffset(Date.parse(checkedAt)).slice(0, 19);
}

/** A short hash of the district rows: a change re-reads rejected posts. */
function gazetteerHash(districts: District[]): string {
  return createHash("sha256")
    .update(JSON.stringify(districts))
    .digest("hex")
    .slice(0, 12);
}

/** One run. Throws SourceDown, or anything else, without writing. */
export async function runZuk(deps: ZukCronDeps): Promise<RunSummary> {
  const started = deps.now();
  const since = deps.since ?? started;
  const previousBody = await deps.readFile();
  const previous = previousBody ? parseZukFile(previousBody) : null;
  const today = todayInWarsaw(started);
  const source = deps.source ?? gminaLubaczow;
  const rules = { source: source.water };
  const area = source.water.area;
  const tag = { source: source.id };
  const posts = await source.fetchPosts(
    deps.fetch,
    addDays(today, -WINDOW_DAYS),
  );
  const checkedAt = started.toISOString();
  const before = new Map<number, StoredPost | SeenPost>(
    previous
      ? [...previous.active, ...previous.seen].map((p) => [p.id, p])
      : [],
  );
  const toRead = posts.filter((post) => {
    const old = before.get(post.id);
    return (
      !old ||
      edited(post, old) ||
      old.reason === AI_UNAVAILABLE ||
      old.reader < ZUK_READER
    );
  });
  const window = new Set(posts.map((p) => p.id));
  const kept = (previous?.rejected ?? []).filter((e) => window.has(e.postId));
  const places =
    toRead.length > 0 || kept.length > 0 ? await deps.places() : null;
  const gazetteer = places
    ? gazetteerHash(places.districts ?? [])
    : (previous?.gazetteer ?? null);
  // The districts changed: every post with a rejected item is read again.
  if (places && previous && previous.gazetteer !== gazetteer)
    for (const post of posts)
      if (!toRead.includes(post) && kept.some((e) => e.postId === post.id))
        toRead.push(post);
  const system = places && source.systemPrompt(places);
  const listed = places && new Listed(places, area);
  const read = new Set<number>();
  const rejected: RejectedEntry[] = [];
  const readAi = deps.readAi ?? readWithAi;

  let aiCalls = 0;
  let costUsd = 0;
  let aiDown = !deps.xaiKey;
  const stored: Array<StoredPost | SeenPost> = [];
  for (const fed of posts) {
    const old = before.get(fed.id);
    if (!toRead.includes(fed) && old) {
      stored.push(old);
      continue;
    }
    let post: ZukPost = {
      ...fed,
      modified: lastChange(fed, old, checkedAt),
    };
    const digest = post.digest === undefined ? {} : { digest: post.digest };
    const seen = (reason: string): SeenPost => ({
      id: post.id,
      modified: post.modified,
      reason,
      reader: ZUK_READER,
      ...digest,
    });
    // Not read this run: its old record until it is, else for a new post
    // a retry (xAI failed) or nothing (over the cap: read on a later run).
    const wait = (failed: boolean) => {
      if (old) stored.push(old);
      else if (failed) stored.push(seen(AI_UNAVAILABLE));
    };
    if (aiDown || !places || !system || !listed) {
      wait(true);
      continue;
    }
    if (
      aiCalls >= MAX_AI_CALLS ||
      deps.now().getTime() - since.getTime() > AI_BUDGET_MS
    ) {
      wait(false);
      continue;
    }
    if (source.fullPost) {
      try {
        post = { ...(await source.fullPost(deps.fetch, post)), ...digest };
      } catch (error) {
        deps.log({
          zuk: "page-error",
          ...tag,
          post: post.id,
          error: (error as Error).message,
        });
        wait(true);
        continue;
      }
    }
    aiCalls++;
    const title = plainText(post.title.rendered);
    let reading: AiReading;
    try {
      reading = await readAi(
        {
          published: post.date,
          title,
          text: plainText(post.content.rendered),
        },
        system,
        deps.xaiKey as string,
        deps.fetch,
      );
    } catch (error) {
      aiDown = true;
      deps.log({
        zuk: "ai-error",
        ...tag,
        post: post.id,
        error: (error as Error).message,
      });
      wait(true);
      continue;
    }
    costUsd += reading.costUsd;
    read.add(post.id);
    const type = reading.result.post_type;
    // Its rejected items, for review, the model's suggestions listed only.
    const reject = (items: Rejection[]) => {
      for (const r of items)
        rejected.push({
          postId: post.id,
          url: post.link,
          sourceId: source.id,
          publishedAt: wall(post.date),
          readAt: checkedAt,
          item: r.item,
          reason: r.reason,
          suggested_places: r.item.suggested_places.filter((n) =>
            listed.has(n),
          ),
        });
    };
    const usage = {
      zuk: "ai",
      ...tag,
      post: post.id,
      model: reading.model,
      ...reading.usage,
      latencyMs: reading.latencyMs,
      costUsd: Number(reading.costUsd.toFixed(6)),
      postType: type,
    };
    if (type === "other") {
      deps.log({ ...usage, status: "notice", reason: NOT_WATER });
      stored.push(seen(NOT_WATER));
      continue;
    }
    const base = {
      id: post.id,
      sourceId: source.id,
      modified: post.modified,
      reader: ZUK_READER,
      url: post.link,
      title,
      publishedAt: wall(post.date),
      updatedAt: wall(post.modified),
      // An area's source concerns the area alone, named or not.
      localityIds: area ? [...area].sort() : mentionedLocalities(post, places),
      ...(reading.result.changes_earlier_dates ? { change: true } : {}),
      ...(reading.result.is_past ? { past: true } : {}),
      ...digest,
    };
    if (type === "water_quality") {
      const quality = readQualityPost(post, reading.result, places, rules);
      reject(quality.rejected);
      deps.log({
        ...usage,
        status: "notice",
        reason: WATER_QUALITY,
        places: quality.places.length,
        rejected: quality.rejected.length,
      });
      stored.push({
        ...base,
        status: "notice",
        reason: WATER_QUALITY,
        itemCount: 0,
        items: [],
        qualityStatus: quality.status,
        places: quality.places,
      });
      continue;
    }
    const result = readPost(post, reading.result, places, checkedAt, rules);
    reject(result.rejected);
    const unmatched: Unmatched[] = result.rejected.map((r) => ({
      words: r.words,
      localityId: r.localityId,
    }));
    deps.log({
      ...usage,
      status: result.status,
      rejected: result.rejected.length,
      ...(result.status === "notice"
        ? { reason: result.reason }
        : {
            items: result.items.length,
            ...(result.doubts ? { doubts: result.doubts } : {}),
          }),
    });
    stored.push({
      ...base,
      ...(result.status === "parsed"
        ? {
            status: "parsed",
            itemCount: result.items.length,
            items: result.items,
            ...(unmatched.length > 0 ? { unmatched } : {}),
            ...(result.doubts ? { doubts: result.doubts } : {}),
          }
        : {
            status: "notice",
            reason: result.reason,
            itemCount: 0,
            items: [],
          }),
    });
  }

  // A post read this run replaces its own entries; the rest stay while
  // their post is in the window.
  rejected.unshift(...kept.filter((e) => !read.has(e.postId)));
  const { active, seen } = settle(stored, today);
  const changed =
    !previous ||
    content(previous.active, previous.seen) !== content(active, seen);
  // Written even when unchanged: checkedAt says we read the posts now.
  const file: ZukFile = {
    version: ZUK_FILE_VERSION,
    generatedAt: changed ? checkedAt : previous.generatedAt,
    checkedAt,
    gazetteer,
    active,
    seen,
    rejected,
  };
  await deps.writeFile(JSON.stringify(file));
  if (changed) deps.purge(WATER);
  if (rejected.length > 0)
    deps.log({ zuk: "rejected", ...tag, gazetteer, entries: rejected });
  const summary = {
    posts: posts.length,
    active: active.length,
    aiCalls,
    costUsd: Number(costUsd.toFixed(6)),
    changed,
  };
  deps.log({ zuk: "run", ...tag, ...summary });
  return summary;
}

/** One source's run, its failure logged and returned, never thrown. */
async function runOne(
  deps: ZukCronDeps,
): Promise<RunSummary | { error: unknown; down: boolean }> {
  try {
    return await runZuk(deps);
  } catch (error) {
    const down = error instanceof SourceDown;
    deps.log({
      zuk: down ? "source-down" : "error",
      source: (deps.source ?? gminaLubaczow).id,
      error: (error as Error).message,
    });
    return { error, down };
  }
}

/**
 * The route: Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`. `deps`
 * is the gmina's run, whose result is the response's (502 or 500 if it
 * failed); then every source of `more`, each on its own: a failure is
 * logged and listed under `sources`, never the gmina's run's or the
 * response's status.
 */
export async function handleZukCron(
  request: Request,
  cronSecret: string | undefined,
  deps: ZukCronDeps,
  more: ZukCronDeps[] = [],
): Promise<Response> {
  const denied = cronDenied(request, cronSecret);
  if (denied) return denied;
  const main = await runOne(deps);
  const sources: Record<string, unknown> = {};
  for (const run of more) {
    const result = await runOne(run);
    sources[(run.source ?? gminaLubaczow).id] =
      "error" in result
        ? { error: result.down ? "source unavailable" : "failed" }
        : result;
  }
  const extra = more.length > 0 ? { sources } : {};
  if (!("error" in main))
    return Response.json({ ...main, ...extra }, { headers: NO_STORE });
  return Response.json(
    { error: main.down ? "source unavailable" : "failed", ...extra },
    { status: main.down ? 502 : 500, headers: NO_STORE },
  );
}
