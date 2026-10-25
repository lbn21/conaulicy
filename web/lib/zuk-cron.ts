// The ZUK cron (app/api/cron/zuk/route.ts, every 15 minutes): reads the
// gmina's recent posts, has the model read every post that is new, edited,
// read by an older reader (ZUK_READER) or whose last reading failed, keeps
// every other post's stored result, and writes the file (lib/zuk-data.ts)
// on every run that read the posts: checkedAt is that run, generatedAt the
// last run that changed its content. The model
// says what a post is: a water cut is read for its cuts, a water-quality
// warning for its places (not shown yet), anything else is "not-water",
// never read again; the old keyword filter only cross-checks it, in the
// log. A post whose title's days are all over is not read ("past"). Only
// the water posts that still matter are `active`; the rest is a slim
// `seen` record. The gmina's site down: the old file stays, unchanged, and
// turns stale. xAI down: new and edited posts are retried next run, never
// shown; so are those over the run's cap. A post read before keeps that
// reading until it is read again. A file of an older version: no
// file, every post is read afresh. Dependencies come in, so the tests mock
// them.

import { addDays, todayInWarsaw } from "./dates.ts";
import { NO_STORE } from "./headers.ts";
import { cronDenied } from "./secret.ts";
import { gminaLubaczow } from "./sources/gmina-lubaczow/index.ts";
import { type PostSource, SourceDown } from "./sources/source.ts";
import {
  isChangePost,
  isPastPost,
  mentionedLocalities,
  plainText,
  readPost,
  readQualityPost,
  wall,
} from "./zuk.ts";
import { type AiReading, readWithAi } from "./zuk-ai.ts";
import {
  AI_UNAVAILABLE,
  NOT_WATER,
  PAST,
  parseZukFile,
  type SeenPost,
  type StoredPost,
  settle,
  WATER_QUALITY,
  ZUK_FILE_VERSION,
  ZUK_READER,
  type ZukFile,
} from "./zuk-data.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

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
  places: () => Promise<ZukPlaces>;
  readAi?: typeof readWithAi;
  /** Whose posts: lib/sources; the gmina Lubaczów's by default. */
  source?: PostSource;
  xaiKey: string | undefined;
  now: () => Date;
  log: (line: Record<string, unknown>) => void;
};

export type RunSummary = {
  posts: number;
  active: number;
  aiCalls: number;
  costUsd: number;
  /** The file's content changed (generatedAt moved). */
  changed: boolean;
};

/** One run. Throws SourceDown, or anything else, without writing. */
export async function runZuk(deps: ZukCronDeps): Promise<RunSummary> {
  const started = deps.now();
  const previousBody = await deps.readFile();
  const previous = previousBody ? parseZukFile(previousBody) : null;
  const today = todayInWarsaw(started);
  const source = deps.source ?? gminaLubaczow;
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
      old.modified !== post.modified ||
      old.reason === AI_UNAVAILABLE ||
      old.reader < ZUK_READER
    );
  });
  const places = toRead.length > 0 ? await deps.places() : null;
  const system = places && source.systemPrompt(places);
  const readAi = deps.readAi ?? readWithAi;

  let aiCalls = 0;
  let costUsd = 0;
  let aiDown = !deps.xaiKey;
  const stored: Array<StoredPost | SeenPost> = [];
  for (const post of posts) {
    const old = before.get(post.id);
    if (!toRead.includes(post) && old) {
      stored.push(old);
      continue;
    }
    const seen = (reason: string): SeenPost => ({
      id: post.id,
      modified: post.modified,
      reason,
      reader: ZUK_READER,
    });
    if (isPastPost(post, today)) {
      stored.push(seen(PAST));
      continue;
    }
    // Not read this run: its old record until it is, else for a new post
    // a retry (xAI failed) or nothing (over the cap: read on a later run).
    const wait = (failed: boolean) => {
      if (old) stored.push(old);
      else if (failed) stored.push(seen(AI_UNAVAILABLE));
    };
    if (aiDown || !places || !system) {
      wait(true);
      continue;
    }
    if (
      aiCalls >= MAX_AI_CALLS ||
      deps.now().getTime() - started.getTime() > AI_BUDGET_MS
    ) {
      wait(false);
      continue;
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
        post: post.id,
        error: (error as Error).message,
      });
      wait(true);
      continue;
    }
    costUsd += reading.costUsd;
    const type = reading.result.post_type;
    const keywords = source.keywords?.(post);
    if (keywords !== undefined && keywords !== (type !== "other"))
      deps.log({
        zuk: "classify-disagree",
        post: post.id,
        kind: type,
        regex: keywords,
      });
    const usage = {
      zuk: "ai",
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
      localityIds: mentionedLocalities(post, places),
      ...(isChangePost(post) ? { change: true } : {}),
      ...(reading.result.is_past ? { past: true } : {}),
    };
    if (type === "water_quality") {
      const quality = readQualityPost(post, reading.result, places);
      deps.log({
        ...usage,
        status: "notice",
        reason: WATER_QUALITY,
        places: quality.places.length,
        dropped: quality.dropped,
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
    const read = readPost(post, reading.result, places, checkedAt);
    deps.log({
      ...usage,
      status: read.status,
      ...(read.status === "notice"
        ? { reason: read.reason }
        : { items: read.items.length, dropped: read.dropped }),
    });
    stored.push({
      ...base,
      ...(read.status === "parsed"
        ? { status: "parsed", itemCount: read.items.length, items: read.items }
        : { status: "notice", reason: read.reason, itemCount: 0, items: [] }),
    });
  }

  const { active, seen } = settle(stored, today);
  const changed =
    !previous ||
    JSON.stringify([previous.active, previous.seen]) !==
      JSON.stringify([active, seen]);
  // Written even when unchanged: checkedAt says we read the posts now.
  const file: ZukFile = {
    version: ZUK_FILE_VERSION,
    generatedAt: changed ? checkedAt : previous.generatedAt,
    checkedAt,
    active,
    seen,
  };
  await deps.writeFile(JSON.stringify(file));
  const summary = {
    posts: posts.length,
    active: active.length,
    aiCalls,
    costUsd: Number(costUsd.toFixed(6)),
    changed,
  };
  deps.log({ zuk: "run", ...summary });
  return summary;
}

/** The route: Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`. */
export async function handleZukCron(
  request: Request,
  cronSecret: string | undefined,
  deps: ZukCronDeps,
): Promise<Response> {
  const denied = cronDenied(request, cronSecret);
  if (denied) return denied;
  try {
    return Response.json(await runZuk(deps), { headers: NO_STORE });
  } catch (error) {
    const down = error instanceof SourceDown;
    deps.log({
      zuk: down ? "source-down" : "error",
      error: (error as Error).message,
    });
    return Response.json(
      { error: down ? "source unavailable" : "failed" },
      { status: down ? 502 : 500, headers: NO_STORE },
    );
  }
}
