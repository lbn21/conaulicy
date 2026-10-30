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
// every source at the same time (handleZukCron), each failing on its own,
// each its posts newest first. A source that gives only a summary
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
  plainText,
  type Rejection,
  readPost,
  readQualityPost,
  wall,
  type ZukPost,
} from "./zuk.ts";
import {
  type AiReading,
  InvalidReply,
  readWithAi,
  TIMEOUT_MS,
} from "./zuk-ai.ts";
import {
  AI_UNAVAILABLE,
  INVALID_REPLY,
  movedSince,
  NOT_WATER,
  parseZukFile,
  type RejectedEntry,
  type Retry,
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
/**
 * A model call is started only with at least this long left before the
 * deadline: its whole timeout plus a margin for the Blob write.
 */
const AI_LEFT_MS = TIMEOUT_MS + 30_000;
/**
 * A reply off the schema: the post is tried again after these waits, one
 * per failure; one more failure and it is given up (the rejected list).
 */
const RETRY_AFTER_MS = [60 * 60_000, 6 * 60 * 60_000];

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
  /**
   * When the function is stopped: the route's start plus its maxDuration.
   * None: no time limit on model calls (only MAX_AI_CALLS).
   */
  deadline?: Date;
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
const edited = (post: ZukPost, old: Pick<SeenPost, "modified" | "digest">) =>
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
  const hash = places ? gazetteerHash(places.districts ?? []) : null;
  // The districts changed: every post with a rejected place is read again,
  // and the new hash is kept only once each of them has been.
  const flagged =
    places && previous && previous.gazetteer !== hash
      ? posts.filter((post) =>
          kept.some((e) => e.postId === post.id && e.reason !== INVALID_REPLY),
        )
      : [];
  for (const post of flagged) if (!toRead.includes(post)) toRead.push(post);
  // A post whose reply was not the schema: its tries so far, if it is the
  // same post read by the same reader.
  const retryOf = (post: ZukPost) =>
    (previous?.retries ?? []).find(
      (r) =>
        r.postId === post.id && r.reader === ZUK_READER && !edited(post, r),
    );
  const retries: Retry[] = [];
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
    const retry = retryOf(fed);
    if (retry) retries.push(retry);
    if (
      retry &&
      (retry.retryAt === null || started.getTime() < Date.parse(retry.retryAt))
    ) {
      wait(false);
      continue;
    }
    if (aiDown || !places || !system || !listed) {
      wait(true);
      continue;
    }
    if (
      aiCalls >= MAX_AI_CALLS ||
      (deps.deadline &&
        deps.deadline.getTime() - deps.now().getTime() < AI_LEFT_MS)
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
      if (error instanceof InvalidReply) {
        // This post's failure alone: tried again later, then given up.
        const attempts = (retry?.attempts ?? 0) + 1;
        const after = RETRY_AFTER_MS[attempts - 1];
        const next: Retry = {
          postId: post.id,
          reader: ZUK_READER,
          modified: post.modified,
          ...digest,
          attempts,
          retryAt:
            after === undefined
              ? null
              : new Date(started.getTime() + after).toISOString(),
        };
        if (retry) retries.splice(retries.indexOf(retry), 1);
        retries.push(next);
        if (next.retryAt === null)
          rejected.push({
            postId: post.id,
            url: post.link,
            sourceId: source.id,
            publishedAt: wall(post.date),
            readAt: checkedAt,
            item: null,
            reason: INVALID_REPLY,
            suggested_places: [],
            raw: error.content.slice(0, 2000),
          });
        deps.log({ zuk: "ai-invalid", ...tag, post: post.id, attempts });
        wait(true);
        continue;
      }
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
    if (retry) retries.splice(retries.indexOf(retry), 1);
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
      ...(reading.result.changes_earlier_dates ? { change: true } : {}),
      ...(reading.result.is_past ? { past: true } : {}),
      ...digest,
    };
    if (type === "water_quality") {
      const quality = readQualityPost(post, reading.result, places, rules);
      reject(quality.rejected);
      // An area's source concerns the area alone, named or not; else the
      // localities its items name.
      const localityIds = area ? [...area].sort() : quality.localityIds;
      deps.log({
        ...usage,
        status: "notice",
        reason: WATER_QUALITY,
        places: quality.places.length,
        rejected: quality.rejected.length,
      });
      stored.push({
        ...base,
        localityIds,
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
      localityIds: area ? [...area].sort() : result.localityIds,
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
  // The new districts' hash only once every flagged post was read again.
  const gazetteer =
    hash !== null && flagged.every((p) => read.has(p.id))
      ? hash
      : (previous?.gazetteer ?? hash);
  const file: ZukFile = {
    version: ZUK_FILE_VERSION,
    generatedAt: changed ? checkedAt : previous.generatedAt,
    checkedAt,
    gazetteer,
    active,
    seen,
    rejected,
    retries: retries.filter((r) => window.has(r.postId)),
  };
  await deps.writeFile(JSON.stringify(file));
  // Also when time alone moved what the pages show (a Warsaw midnight, a
  // cut's end) since the last read: their cached copies filtered by then.
  if (changed || movedSince(previous, new Date(previous.checkedAt), started))
    deps.purge(WATER);
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
 * failed); every source of `more` runs at the same time, each on its own
 * (its own file; a slow model call of one never uses up another's time
 * before the deadline): a failure is logged and listed under `sources`,
 * never the gmina's run's or the response's status.
 */
export async function handleZukCron(
  request: Request,
  cronSecret: string | undefined,
  deps: ZukCronDeps,
  more: ZukCronDeps[] = [],
): Promise<Response> {
  const denied = cronDenied(request, cronSecret);
  if (denied) return denied;
  const [main, ...results] = await Promise.all([deps, ...more].map(runOne));
  const sources: Record<string, unknown> = {};
  for (const [i, run] of more.entries()) {
    const result = results[i];
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
