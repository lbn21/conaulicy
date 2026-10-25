// The ZUK cron (app/api/cron/zuk/route.ts, every 15 minutes): reads the
// gmina's recent posts, has the model read only the ZUK posts that are new
// or edited (or whose last reading failed or waited), keeps every other
// post's stored result, and writes the file (lib/zuk-data.ts) when its
// content changed or its checkedAt is RECHECK_MS old. A post whose title's
// days are all over is not read ("past"). The gmina's site down: the old
// file stays, unchanged, and turns stale. xAI down: new and edited posts
// become Notices, retried next run; so do those over the run's cap. A file
// of an older version: every post is read again. Dependencies come in, so
// the tests mock them.

import { addDays, todayInWarsaw } from "./dates.ts";
import { NO_STORE } from "./headers.ts";
import { sameSecret } from "./secret.ts";
import {
  current,
  isChangePost,
  isPastPost,
  isZukPost,
  mentionedLocalities,
  plainText,
  readPost,
  wall,
  type ZukPost,
} from "./zuk.ts";
import { type AiReading, readWithAi, systemPrompt } from "./zuk-ai.ts";
import {
  AI_DEFERRED,
  AI_UNAVAILABLE,
  PAST,
  parseZukFile,
  type StoredPost,
  ZUK_FILE_VERSION,
  type ZukFile,
} from "./zuk-data.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

export const WP_POSTS = "https://www.gminalubaczow.pl/wp-json/wp/v2/posts";
/** Posts published in the last this many days are read. */
const WINDOW_DAYS = 30;
const WP_PAGES = 5;
const WP_TIMEOUT_MS = 15_000;
/** At most this many model calls per run; the rest wait for the next. */
const MAX_AI_CALLS = 4;
/** No new model call after this long into the run (maxDuration 300 s). */
const AI_BUDGET_MS = 200_000;
/** An unchanged file is rewritten (checkedAt) after this long. */
const RECHECK_MS = 30 * 60_000;

export type ZukCronDeps = {
  fetch: typeof fetch;
  /** The file's body, or null if there is none yet. Throws if unreadable. */
  readFile: () => Promise<string | null>;
  writeFile: (body: string) => Promise<void>;
  places: () => Promise<ZukPlaces>;
  readAi?: typeof readWithAi;
  xaiKey: string | undefined;
  now: () => Date;
  log: (line: Record<string, unknown>) => void;
};

class SourceDown extends Error {}

function isPost(v: unknown): v is ZukPost {
  const p = v as Record<string, unknown>;
  const rendered = (x: unknown) =>
    typeof (x as { rendered?: unknown })?.rendered === "string";
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.id === "number" &&
    typeof p.date === "string" &&
    typeof p.modified === "string" &&
    typeof p.link === "string" &&
    rendered(p.title) &&
    rendered(p.content)
  );
}

/** The posts published since `after` (a Warsaw day). Throws SourceDown. */
async function fetchPosts(
  fetcher: typeof fetch,
  after: string,
): Promise<ZukPost[]> {
  const posts: ZukPost[] = [];
  for (let page = 1; page <= WP_PAGES; page++) {
    const url = new URL(WP_POSTS);
    url.searchParams.set("after", `${after}T00:00:00`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("_fields", "id,date,modified,link,title,content");
    let body: unknown;
    let pages: number;
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(WP_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.json();
      pages = Number(response.headers.get("x-wp-totalpages") ?? "1");
    } catch (error) {
      throw new SourceDown(`gmina posts: ${(error as Error).message}`);
    }
    if (!Array.isArray(body) || !body.every(isPost))
      throw new SourceDown("gmina posts: not a list of posts");
    posts.push(...body);
    if (!(page < pages)) break;
  }
  return posts;
}

export type RunSummary = {
  posts: number;
  aiCalls: number;
  costUsd: number;
  written: boolean;
};

/** One run. Throws SourceDown, or anything else, without writing. */
export async function runZuk(deps: ZukCronDeps): Promise<RunSummary> {
  const started = deps.now();
  const previousBody = await deps.readFile();
  const previous = previousBody ? parseZukFile(previousBody) : null;
  const today = todayInWarsaw(started);
  const posts = (
    await fetchPosts(deps.fetch, addDays(today, -WINDOW_DAYS))
  ).filter(isZukPost);
  const checkedAt = started.toISOString();
  const before = new Map(
    previous?.version === ZUK_FILE_VERSION
      ? previous.posts.map((p) => [p.id, p])
      : [],
  );
  const toRead = posts.filter((post) => {
    const old = before.get(post.id);
    return (
      !old ||
      old.modified !== post.modified ||
      old.reason === AI_UNAVAILABLE ||
      old.reason === AI_DEFERRED
    );
  });
  const places = toRead.length > 0 ? await deps.places() : null;
  const system = places && systemPrompt(places);
  const readAi = deps.readAi ?? readWithAi;

  let aiCalls = 0;
  let costUsd = 0;
  let aiDown = !deps.xaiKey;
  const stored: StoredPost[] = [];
  for (const post of posts) {
    const old = before.get(post.id);
    if (!toRead.includes(post) && old) {
      stored.push({ ...old, items: current(old.items, today) });
      continue;
    }
    const base = {
      id: post.id,
      modified: post.modified,
      url: post.link,
      title: plainText(post.title.rendered),
      publishedAt: wall(post.date),
      updatedAt: wall(post.modified),
      localityIds: places ? mentionedLocalities(post, places) : [],
      ...(isChangePost(post) ? { change: true } : {}),
    };
    const notice = (reason: string): StoredPost => ({
      ...base,
      status: "notice",
      reason,
      itemCount: 0,
      items: [],
    });
    if (isPastPost(post, today)) {
      stored.push(notice(PAST));
      continue;
    }
    if (aiDown || !places || !system) {
      stored.push(notice(AI_UNAVAILABLE));
      continue;
    }
    if (
      aiCalls >= MAX_AI_CALLS ||
      deps.now().getTime() - started.getTime() > AI_BUDGET_MS
    ) {
      stored.push(notice(AI_DEFERRED));
      continue;
    }
    aiCalls++;
    let reading: AiReading;
    try {
      reading = await readAi(
        {
          published: post.date,
          title: base.title,
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
      stored.push(notice(AI_UNAVAILABLE));
      continue;
    }
    costUsd += reading.costUsd;
    const read = readPost(post, reading.result, places, checkedAt);
    deps.log({
      zuk: "ai",
      post: post.id,
      model: reading.model,
      ...reading.usage,
      latencyMs: reading.latencyMs,
      costUsd: Number(reading.costUsd.toFixed(6)),
      status: read.status,
      ...(read.status === "notice"
        ? { reason: read.reason }
        : { items: read.items.length, dropped: read.dropped }),
    });
    stored.push({
      ...base,
      ...(reading.result.is_past ? { past: true } : {}),
      model: reading.model,
      usage: reading.usage,
      costUsd: reading.costUsd,
      ...(read.status === "parsed"
        ? {
            status: "parsed",
            itemCount: read.items.length,
            items: current(read.items, today),
          }
        : { status: "notice", reason: read.reason, itemCount: 0, items: [] }),
    });
  }

  const changed =
    !previous || JSON.stringify(previous.posts) !== JSON.stringify(stored);
  const due =
    !previous ||
    started.getTime() - Date.parse(previous.checkedAt) >= RECHECK_MS;
  if (changed || due) {
    const file: ZukFile = {
      version: ZUK_FILE_VERSION,
      generatedAt: changed || !previous ? checkedAt : previous.generatedAt,
      checkedAt,
      posts: stored,
    };
    await deps.writeFile(JSON.stringify(file));
  }
  const summary = {
    posts: stored.length,
    aiCalls,
    costUsd: Number(costUsd.toFixed(6)),
    written: changed || due,
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
  const given = request.headers.get("authorization") ?? "";
  if (!cronSecret || !sameSecret(given, `Bearer ${cronSecret}`))
    return new Response("Unauthorized", { status: 401, headers: NO_STORE });
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
