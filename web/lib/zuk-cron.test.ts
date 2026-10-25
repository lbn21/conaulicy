import assert from "node:assert/strict";
import { test } from "node:test";
import { WP_POSTS } from "./sources/gmina-lubaczow/fetch.ts";
import { systemPrompt } from "./sources/gmina-lubaczow/prompt.ts";
import type { ZukPost } from "./zuk.ts";
import type { AiInput, AiReading, AiResult } from "./zuk-ai.ts";
import { handleZukCron, runZuk, type ZukCronDeps } from "./zuk-cron.ts";
import {
  AI_DEFERRED,
  AI_UNAVAILABLE,
  NOT_WATER,
  PAST,
  parseZukFile,
  WATER_QUALITY,
  type ZukFile,
  zukView,
} from "./zuk-data.ts";
import { PLACES, reading, realPosts } from "./zuk-fixture.ts";

const SECRET = "cron-secret";
// Sunday 25 Oct 2026: 39885's cuts (26-29 Oct) are still to come, the
// other posts' days are over.
const NOW = new Date("2026-10-25T08:00:00Z");
// Wednesday 14 Oct 2026: every post's days are still to come.
const EARLIER = new Date("2026-10-14T08:00:00Z");
const FOX = 39868;
const NEW = 40000;
// The eight newest real posts: seven ZUK, one not (the fox post: no date in
// its title, so read, and "other").
const RECENT = realPosts().filter((p) =>
  [39885, 39872, 39865, 39863, 39857, 39855, 39766, FOX].includes(p.id),
);

type World = {
  posts: ZukPost[] | "down";
  file: string | null;
  writes: string[];
  aiCalls: number[];
  aiFails: boolean;
  placesLoads: number;
  urls: string[];
  now: Date;
  /** The model's reading of a post, where not its fixture's. */
  readings: Record<number, AiResult>;
  logs: Array<Record<string, unknown>>;
};

function world(over: Partial<World> = {}): World {
  return {
    posts: RECENT,
    file: null,
    writes: [],
    aiCalls: [],
    aiFails: false,
    placesLoads: 0,
    urls: [],
    now: NOW,
    readings: {},
    logs: [],
    ...over,
  };
}

function deps(w: World): ZukCronDeps {
  return {
    fetch: (async (url: string | URL) => {
      w.urls.push(String(url));
      assert.ok(String(url).startsWith(WP_POSTS), String(url));
      if (w.posts === "down") return new Response("down", { status: 503 });
      return Response.json(w.posts, { headers: { "x-wp-totalpages": "1" } });
    }) as typeof fetch,
    readFile: async () => w.file,
    writeFile: async (body) => {
      w.writes.push(body);
      w.file = body;
    },
    places: async () => {
      w.placesLoads++;
      return PLACES;
    },
    readAi: async (
      input: AiInput,
      system: string,
      key: string,
    ): Promise<AiReading> => {
      assert.equal(key, "xai-key");
      assert.equal(system, systemPrompt(PLACES));
      const posts = w.posts === "down" ? [] : w.posts;
      const post = posts.find((p) => p.date === input.published);
      assert.ok(post);
      w.aiCalls.push(post.id);
      if (w.aiFails) throw new Error("xAI: HTTP 503");
      return {
        // A new post in the tests is a copy of 39885.
        result:
          w.readings[post.id] ?? reading(post.id >= NEW ? 39885 : post.id),
        model: "grok-4.7",
        usage: {
          promptTokens: 1000,
          completionTokens: 100,
          reasoningTokens: 200,
        },
        costUsd: 0.0038,
        latencyMs: 5000,
      };
    },
    xaiKey: "xai-key",
    now: () => w.now,
    log: (line) => w.logs.push(line),
  };
}

const saved = (w: World): ZukFile => {
  const file = w.file && parseZukFile(w.file);
  assert.ok(file, "no file written");
  return file;
};
const byId = (w: World, id: number) => saved(w).posts.find((p) => p.id === id);

test("auth: Vercel Cron's bearer secret, nothing else", async () => {
  const w = world();
  const call = (auth: string | null, secret: string | undefined = SECRET) =>
    handleZukCron(
      new Request("https://conaulicy.pl/api/cron/zuk", {
        headers: auth ? { authorization: auth } : {},
      }),
      secret,
      deps(w),
    );
  assert.equal((await call(null)).status, 401);
  assert.equal((await call("Bearer wrong")).status, 401);
  assert.equal((await call(SECRET)).status, 401);
  // No CRON_SECRET set: nobody gets in.
  assert.equal((await call("Bearer ", "")).status, 401);
  assert.equal((await call("Bearer undefined", undefined)).status, 401);
  assert.equal(w.urls.length, 0);
  const ok = await call(`Bearer ${SECRET}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
});

test("first run: every new post read, at most four, the rest next run", async () => {
  const w = world({ now: EARLIER });
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885, 39872, 39865, 39863]);
  assert.equal(summary.aiCalls, 4);
  assert.equal(w.writes.length, 1);
  const file = saved(w);
  assert.equal(file.version, 2);
  assert.equal(file.checkedAt, EARLIER.toISOString());
  assert.equal(file.generatedAt, EARLIER.toISOString());
  // No keyword gate: the fox post is stored too.
  assert.deepEqual(
    file.posts.map((p) => p.id),
    [39885, 39872, 39865, 39863, 39857, 39855, 39766, FOX],
  );
  assert.ok(file.posts.every((p) => p.sourceId === "gmina-lubaczow"));
  const first = byId(w, 39885);
  assert.equal(first?.status, "parsed");
  assert.equal(first?.model, "grok-4.7");
  assert.equal(first?.costUsd, 0.0038);
  assert.ok((first?.items.length ?? 0) > 0);
  assert.equal(first?.itemCount, first?.items.length);
  assert.ok(first?.items.every((d) => d.label));
  // Over the cap: waits, not a failure of xAI.
  assert.equal(byId(w, 39857)?.reason, AI_DEFERRED);
  assert.equal(byId(w, 39857)?.itemCount, 0);
  assert.ok((byId(w, 39857)?.localityIds.length ?? 0) > 0);

  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39857, 39855, 39766, FOX]);
  assert.equal(byId(w, 39857)?.status, "parsed");
});

test("past posts: every title day over, stored without a model call", async () => {
  const w = world();
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885, FOX]);
  assert.equal(summary.costUsd, 0.0076);
  const past = byId(w, 39872);
  assert.equal(past?.status, "notice");
  assert.equal(past?.reason, PAST);
  assert.equal(past?.model, undefined);
  assert.equal(past?.itemCount, 0);
  // Not read again on the next run.
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
});

test("items over: itemCount keeps what was read", async () => {
  const w = world({ now: EARLIER });
  await runZuk(deps(w));
  w.aiCalls = [];
  w.now = NOW;
  await runZuk(deps(w));
  // The deferred posts are over by now (past); the fox post has no title
  // day, so it is read.
  assert.deepEqual(w.aiCalls, [FOX]);
  // 39872 (22 Oct) is over: its cuts are gone, their count kept.
  const over = byId(w, 39872);
  assert.equal(over?.status, "parsed");
  assert.equal(over?.items.length, 0);
  assert.ok((over?.itemCount ?? 0) > 0);
});

test("a version 1 file: every post read again", async () => {
  const w = world();
  await runZuk(deps(w));
  const old = JSON.parse(w.file ?? "");
  w.file = JSON.stringify({ ...old, version: 1 });
  w.aiCalls = [];
  w.now = new Date(NOW.getTime() + 60_000);
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885, FOX]);
  assert.equal(saved(w).version, 2);
});

test("unchanged posts: no model call, no places query, results kept", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  const before = w.file;
  w.aiCalls = [];
  w.placesLoads = 0;
  w.writes = [];
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
  assert.equal(w.placesLoads, 0);
  assert.equal(summary.written, false);
  assert.equal(w.file, before);
});

test("unchanged posts: checkedAt rewritten after 30 minutes", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  const generated = saved(w).generatedAt;
  w.writes = [];
  w.now = new Date(NOW.getTime() + 30 * 60_000);
  const summary = await runZuk(deps(w));
  assert.equal(summary.written, true);
  assert.equal(saved(w).checkedAt, w.now.toISOString());
  assert.equal(saved(w).generatedAt, generated);
});

test("an edited post is read again", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  w.aiCalls = [];
  w.posts = RECENT.map((p) =>
    p.id === 39885 ? { ...p, modified: "2026-10-24T09:00:00" } : p,
  );
  w.now = new Date(NOW.getTime() + 60_000);
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885]);
  assert.equal(summary.written, true);
  assert.equal(byId(w, 39885)?.modified, "2026-10-24T09:00:00");
});

test("xAI down: old results kept, new posts Notices, retried later", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  const kept = byId(w, 39885);
  w.aiFails = true;
  w.aiCalls = [];
  const fresh = { ...RECENT[0], id: NEW, date: "2026-10-25T07:00:00" };
  w.posts = [fresh, ...RECENT];
  const summary = await runZuk(deps(w));
  // One failed call, then no more this run.
  assert.equal(summary.aiCalls, 1);
  assert.deepEqual(w.aiCalls, [NEW]);
  assert.equal(byId(w, NEW)?.status, "notice");
  assert.equal(byId(w, NEW)?.reason, AI_UNAVAILABLE);
  assert.deepEqual(byId(w, 39885), kept);

  w.aiFails = false;
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [NEW]);
  assert.equal(byId(w, NEW)?.status, "parsed");
});

test("no XAI_API_KEY: new posts are Notices, nothing called", async () => {
  const w = world({ now: EARLIER });
  await runZuk({ ...deps(w), xaiKey: undefined });
  assert.deepEqual(w.aiCalls, []);
  assert.ok(saved(w).posts.every((p) => p.reason === AI_UNAVAILABLE));
});

test("the gmina's site down: 502, the old file untouched", async () => {
  const w = world();
  await runZuk(deps(w));
  const before = w.file;
  w.writes = [];
  w.posts = "down";
  w.now = new Date(NOW.getTime() + 2 * 3600_000);
  const response = await handleZukCron(
    new Request("https://conaulicy.pl/api/cron/zuk", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    SECRET,
    deps(w),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "source unavailable" });
  assert.equal(w.writes.length, 0);
  assert.equal(w.file, before);
});

test("the gmina's site answers with something else: the same", async () => {
  const w = world({ posts: [{ id: "x" }] as unknown as ZukPost[] });
  await assert.rejects(runZuk(deps(w)), /not a list of posts/);
  assert.equal(w.writes.length, 0);
});

test("WP query: posts of the last 30 days, the fields we read", async () => {
  const w = world();
  await runZuk(deps(w));
  const url = new URL(w.urls[0]);
  assert.equal(url.origin + url.pathname, WP_POSTS);
  assert.equal(url.searchParams.get("after"), "2026-09-25T00:00:00");
  assert.equal(
    url.searchParams.get("_fields"),
    "id,date,modified,link,title,content",
  );
});

test("the file unreadable: the run stops, nothing written", async () => {
  const w = world();
  const failing = {
    ...deps(w),
    readFile: async () => {
      throw new Error("blob: 500");
    },
  };
  await assert.rejects(runZuk(failing), /blob: 500/);
  assert.equal(w.writes.length, 0);
  assert.deepEqual(w.urls, []);
});

test("post_type other: a not-water Notice, never read again, never shown", async () => {
  const w = world();
  await runZuk(deps(w));
  const fox = byId(w, FOX);
  assert.equal(fox?.status, "notice");
  assert.equal(fox?.reason, NOT_WATER);
  assert.equal(fox?.itemCount, 0);
  assert.deepEqual(fox?.items, []);
  assert.equal(fox?.model, "grok-4.7");
  w.aiCalls = [];
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
  const view = zukView(saved(w), w.now);
  assert.ok(view.notices.every((n) => n.uid !== `zuk-${FOX}`));
});

const QUALITY: ZukPost = {
  id: NEW,
  date: "2026-10-24T09:00:00",
  modified: "2026-10-24T09:00:00",
  link: "https://www.gminalubaczow.pl/komunikat",
  title: {
    rendered:
      "Uwaga! Brak przydatności wody do spożycia z wodociągu w Hucie Kryształowej",
  },
  content: {
    rendered:
      "<p>Od dnia 24.10.2026 woda z wodociągu w miejscowości Huta Kryształowa nie nadaje się do spożycia. Przed spożyciem przegotować.</p>",
  },
};

const qualityItem = (locality: string, date = "2026-10-24") => ({
  date,
  start: null,
  end: null,
  locality,
  street: null,
  place_verbatim: locality,
  note: null,
  kind: "quality" as const,
});

const qualityReading = (
  items: AiResult["items"],
  status: AiResult["quality_status"] = "warning",
): AiResult => ({
  post_type: "water_quality",
  quality_status: status,
  is_past: false,
  items,
});

test("post_type water_quality: its places through the gate, its day, not shown", async () => {
  const w = world({
    posts: [QUALITY],
    readings: { [NEW]: qualityReading([qualityItem("Huta Kryształowa")]) },
  });
  await runZuk(deps(w));
  const post = byId(w, NEW);
  assert.equal(post?.status, "notice");
  assert.equal(post?.reason, WATER_QUALITY);
  assert.deepEqual(post?.items, []);
  assert.equal(post?.qualityStatus, "warning");
  assert.equal(post?.places?.length, 1);
  const [place] = post?.places ?? [];
  assert.equal(place.label.locality, "Huta Kryształowa");
  assert.equal(place.place.streetId, null);
  assert.equal(place.date, "2026-10-24");
  assert.equal(place.where, "Huta Kryształowa");
  const view = zukView(saved(w), NOW);
  assert.deepEqual(view.notices, []);
  assert.deepEqual(view.disruptions, []);
  // Not read again.
  w.aiCalls = [];
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
});

test("post_type water_quality: no place passing the gate, no places", async () => {
  // Opaka is ours but not in the text; "Nowy Dwór" is in neither.
  const w = world({
    posts: [QUALITY],
    readings: {
      [NEW]: qualityReading([qualityItem("Opaka"), qualityItem("Nowy Dwór")]),
    },
  });
  await runZuk(deps(w));
  const post = byId(w, NEW);
  assert.equal(post?.reason, WATER_QUALITY);
  assert.deepEqual(post?.places, []);
  assert.ok(w.logs.some((l) => l.zuk === "ai" && l.places === 0));
});

test("post_type water_quality: a day not in the text is not kept", async () => {
  const w = world({
    posts: [QUALITY],
    readings: {
      [NEW]: qualityReading(
        [qualityItem("Huta Kryształowa", "2026-10-30")],
        "lifted",
      ),
    },
  });
  await runZuk(deps(w));
  const post = byId(w, NEW);
  assert.equal(post?.qualityStatus, "lifted");
  assert.equal(post?.places?.length, 1);
  assert.equal(post?.places?.[0].date, null);
});

test("keywords and the model disagree: logged, the model decides", async () => {
  const other: AiResult = {
    post_type: "other",
    quality_status: null,
    is_past: false,
    items: [],
  };
  const w = world({
    readings: {
      39885: other,
      [FOX]: qualityReading([]),
    },
  });
  await runZuk(deps(w));
  const disagree = w.logs.filter((l) => l.zuk === "classify-disagree");
  assert.deepEqual(disagree, [
    { zuk: "classify-disagree", post: 39885, kind: "other", regex: true },
    {
      zuk: "classify-disagree",
      post: FOX,
      kind: "water_quality",
      regex: false,
    },
  ]);
  assert.equal(byId(w, 39885)?.reason, NOT_WATER);
  assert.equal(byId(w, FOX)?.reason, WATER_QUALITY);
});

test("keywords and the model agree: nothing logged", async () => {
  const w = world();
  await runZuk(deps(w));
  assert.ok(!w.logs.some((l) => l.zuk === "classify-disagree"));
});

test("many new posts: still four model calls a run, the rest deferred", async () => {
  const many = Array.from({ length: 10 }, (_, n) => ({
    ...RECENT[0],
    id: NEW + n,
    date: `2026-10-24T0${n}:00:00`,
  }));
  const w = world({ posts: many });
  const summary = await runZuk(deps(w));
  assert.equal(summary.aiCalls, 4);
  assert.deepEqual(w.aiCalls, [NEW, NEW + 1, NEW + 2, NEW + 3]);
  const deferred = saved(w).posts.filter((p) => p.reason === AI_DEFERRED);
  assert.equal(deferred.length, 6);
});
