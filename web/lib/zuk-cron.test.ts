import assert from "node:assert/strict";
import { test } from "node:test";
import { WATER } from "./headers.ts";
import { WP_POSTS } from "./sources/gmina-lubaczow/fetch.ts";
import { systemPrompt } from "./sources/gmina-lubaczow/prompt.ts";
import type { ZukPost } from "./zuk.ts";
import type { AiInput, AiReading, AiResult } from "./zuk-ai.ts";
import { handleZukCron, runZuk, type ZukCronDeps } from "./zuk-cron.ts";
import {
  AI_UNAVAILABLE,
  NOT_WATER,
  PAST,
  parseZukFile,
  WATER_QUALITY,
  ZUK_READER,
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
  /** Every cache tag purged (revalidateTag), in order. */
  purges: string[];
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
    purges: [],
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
    purge: (tag) => w.purges.push(tag),
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
const byId = (w: World, id: number) => saved(w).active.find((p) => p.id === id);
const seenOf = (w: World, id: number) => saved(w).seen.find((p) => p.id === id);
const ids = (posts: Array<{ id: number }>) => posts.map((p) => p.id);
const cron = (w: World, over: Partial<ZukCronDeps> = {}) =>
  handleZukCron(
    new Request("https://conaulicy.pl/api/cron/zuk", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    SECRET,
    { ...deps(w), ...over },
  );

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
  assert.equal(file.version, 4);
  assert.equal(file.checkedAt, EARLIER.toISOString());
  assert.equal(file.generatedAt, EARLIER.toISOString());
  assert.deepEqual(ids(file.active), [39885, 39872, 39865, 39863]);
  assert.ok(file.active.every((p) => p.sourceId === "gmina-lubaczow"));
  assert.ok(file.active.every((p) => p.reader === ZUK_READER));
  const first = byId(w, 39885);
  assert.equal(first?.status, "parsed");
  // The reading's cost is in the log, not the file.
  assert.equal(first && "costUsd" in first, false);
  assert.equal(first && "usage" in first, false);
  assert.ok(w.logs.some((l) => l.zuk === "ai" && l.costUsd === 0.0038));
  assert.ok((first?.items.length ?? 0) > 0);
  assert.equal(first?.itemCount, first?.items.length);
  assert.ok(first?.items.every((d) => d.label));
  // Over the cap: in neither list, not shown, read next run.
  assert.deepEqual(file.seen, []);
  assert.equal(byId(w, 39857), undefined);
  assert.ok(zukView(file, EARLIER).notices.every((n) => n.uid !== "zuk-39857"));

  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39857, 39855, 39766, FOX]);
  assert.equal(byId(w, 39857)?.status, "parsed");
});

test("past posts: every title day over, seen without a model call", async () => {
  const w = world();
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885, FOX]);
  assert.equal(summary.costUsd, 0.0076);
  assert.equal(byId(w, 39872), undefined);
  assert.deepEqual(seenOf(w, 39872), {
    id: 39872,
    modified: RECENT[1].modified,
    reason: PAST,
    reader: ZUK_READER,
  });
  // Not read again on the next run.
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
});

test("cuts all over: the parsed post moves to seen on the next write", async () => {
  const w = world({ now: EARLIER });
  await runZuk(deps(w));
  assert.equal(byId(w, 39872)?.status, "parsed");
  w.aiCalls = [];
  w.now = NOW;
  await runZuk(deps(w));
  // The deferred posts are over by now (past); the fox post has no title
  // day, so it is read.
  assert.deepEqual(w.aiCalls, [FOX]);
  // 39872 (22 Oct) is over: seen, not read again.
  assert.equal(byId(w, 39872), undefined);
  assert.equal(seenOf(w, 39872)?.reason, PAST);
  assert.deepEqual(ids(saved(w).active), [39885]);
});

test("a file of an older version: the window read afresh, four a run", async () => {
  for (const version of [1, 2, 3]) {
    const w = world({ now: EARLIER });
    w.file = JSON.stringify({
      version,
      generatedAt: EARLIER.toISOString(),
      checkedAt: EARLIER.toISOString(),
      posts: [],
    });
    const summary = await runZuk(deps(w));
    assert.equal(summary.aiCalls, 4, String(version));
    assert.deepEqual(w.aiCalls, [39885, 39872, 39865, 39863]);
    assert.equal(saved(w).version, 4);
    w.aiCalls = [];
    await runZuk(deps(w));
    assert.deepEqual(w.aiCalls, [39857, 39855, 39766, FOX]);
  }
});

test("an older reader: every post read again, four a run", async () => {
  const w = world({ now: EARLIER });
  await runZuk(deps(w));
  await runZuk(deps(w));
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
  const file = saved(w);
  w.file = JSON.stringify({
    ...file,
    active: file.active.map((p) => ({ ...p, reader: ZUK_READER - 1 })),
    seen: file.seen.map((p) => ({ ...p, reader: ZUK_READER - 1 })),
  });
  const summary = await runZuk(deps(w));
  assert.equal(summary.aiCalls, 4);
  assert.deepEqual(w.aiCalls, [39885, 39872, 39865, 39863]);
  // The posts not read yet keep their old reading until their turn.
  assert.equal(byId(w, 39857)?.reader, ZUK_READER - 1);
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39857, 39855, 39766, FOX]);
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
});

test("unchanged posts: no model call, no places query, results kept", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  const before = saved(w);
  w.aiCalls = [];
  w.placesLoads = 0;
  w.writes = [];
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
  assert.equal(w.placesLoads, 0);
  assert.equal(summary.changed, false);
  assert.deepEqual(saved(w).active, before.active);
  assert.deepEqual(saved(w).seen, before.seen);
});

test("unchanged posts: every run writes a new checkedAt, generatedAt kept", async () => {
  const w = world();
  await runZuk(deps(w));
  await runZuk(deps(w));
  const generated = saved(w).generatedAt;
  for (const minutes of [15, 30]) {
    w.writes = [];
    w.now = new Date(NOW.getTime() + minutes * 60_000);
    const summary = await runZuk(deps(w));
    assert.equal(summary.changed, false);
    assert.equal(w.writes.length, 1);
    assert.equal(saved(w).checkedAt, w.now.toISOString());
    assert.equal(saved(w).generatedAt, generated);
  }
});

test("purge: a run that changes the file purges WATER once, after the write", async () => {
  const w = world();
  const order: string[] = [];
  const response = await cron(w, {
    writeFile: async (body) => {
      order.push("write");
      w.file = body;
    },
    purge: (tag) => {
      order.push(`purge ${tag}`);
      w.purges.push(tag);
    },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).changed, true);
  assert.deepEqual(w.purges, [WATER]);
  assert.deepEqual(order, ["write", `purge ${WATER}`]);
  // An edited post read again: purged once more, never DATASET.
  w.purges = [];
  w.posts = RECENT.map((p) =>
    p.id === 39885 ? { ...p, modified: "2026-10-24T09:00:00" } : p,
  );
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  await cron(w);
  assert.deepEqual(w.purges, [WATER]);
});

test("purge: an unchanged run, only checkedAt new, purges nothing", async () => {
  const w = world();
  await cron(w);
  await cron(w);
  for (const minutes of [15, 30, 45]) {
    w.purges = [];
    w.writes = [];
    w.now = new Date(NOW.getTime() + minutes * 60_000);
    const response = await cron(w);
    assert.equal((await response.json()).changed, false);
    assert.equal(w.writes.length, 1);
    assert.equal(saved(w).checkedAt, w.now.toISOString());
    assert.deepEqual(w.purges, []);
  }
});

test("purge: the write fails, nothing purged", async () => {
  const w = world();
  const response = await cron(w, {
    writeFile: async () => {
      throw new Error("blob: 503");
    },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(w.purges, []);
});

test("purge: the gmina's site down, nothing written or purged", async () => {
  const w = world();
  await cron(w);
  w.purges = [];
  w.posts = "down";
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  assert.equal((await cron(w)).status, 502);
  assert.deepEqual(w.purges, []);
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
  assert.equal(summary.changed, true);
  assert.equal(saved(w).generatedAt, w.now.toISOString());
  assert.equal(byId(w, 39885)?.modified, "2026-10-24T09:00:00");
});

test("an edited post not read this run: its old reading kept, read later", async () => {
  const w = world();
  await runZuk(deps(w));
  const kept = byId(w, 39885);
  assert.ok(kept);
  w.posts = RECENT.map((p) =>
    p.id === 39885 ? { ...p, modified: "2026-10-24T09:00:00" } : p,
  );
  w.aiFails = true;
  w.aiCalls = [];
  w.now = new Date(NOW.getTime() + 60_000);
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885]);
  assert.deepEqual(byId(w, 39885), kept);
  w.aiFails = false;
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885]);
  assert.equal(byId(w, 39885)?.modified, "2026-10-24T09:00:00");
});

test("xAI down: old results kept, new posts not shown, retried later", async () => {
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
  // Stored to be retried, never shown.
  assert.equal(byId(w, NEW), undefined);
  assert.equal(seenOf(w, NEW)?.reason, AI_UNAVAILABLE);
  assert.ok(
    zukView(saved(w), NOW).notices.every((n) => n.uid !== `zuk-${NEW}`),
  );
  assert.deepEqual(byId(w, 39885), kept);

  w.aiFails = false;
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [NEW]);
  assert.equal(byId(w, NEW)?.status, "parsed");
});

test("no XAI_API_KEY: new posts retried, nothing called", async () => {
  const w = world({ now: EARLIER });
  await runZuk({ ...deps(w), xaiKey: undefined });
  assert.deepEqual(w.aiCalls, []);
  assert.deepEqual(saved(w).active, []);
  assert.equal(saved(w).seen.length, RECENT.length);
  assert.ok(saved(w).seen.every((p) => p.reason === AI_UNAVAILABLE));
});

test("the gmina's site down: 502, the old file and checkedAt untouched", async () => {
  const w = world();
  await runZuk(deps(w));
  const before = w.file;
  const checked = saved(w).checkedAt;
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
  assert.equal(saved(w).checkedAt, checked);
});

test("the gmina's site answers with something else: the same", async () => {
  const w = world({ posts: [{ id: "x" }] as unknown as ZukPost[] });
  await assert.rejects(runZuk(deps(w)), /not a list of posts/);
  assert.equal(w.writes.length, 0);
});

test("WP query: posts of the last 14 days, the fields we read", async () => {
  const w = world();
  await runZuk(deps(w));
  const url = new URL(w.urls[0]);
  assert.equal(url.origin + url.pathname, WP_POSTS);
  assert.equal(url.searchParams.get("after"), "2026-10-11T00:00:00");
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

test("post_type other: seen as not-water, never read again, never shown", async () => {
  const w = world();
  await runZuk(deps(w));
  assert.equal(byId(w, FOX), undefined);
  // No title, url, localityIds or items.
  assert.deepEqual(seenOf(w, FOX), {
    id: FOX,
    modified: RECENT[7].modified,
    reason: NOT_WATER,
    reader: ZUK_READER,
  });
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
  locality_verbatim: locality,
  street_verbatim: null,
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

test("post_type water_quality: a day not in the text drops that place", async () => {
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
  assert.deepEqual(post?.places, []);
  assert.ok(
    w.logs.some(
      (l) =>
        l.zuk === "ai" &&
        JSON.stringify(l.dropped) === '["item 1: 30.10 not in text"]',
    ),
  );
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
    {
      zuk: "classify-disagree",
      source: "gmina-lubaczow",
      post: 39885,
      kind: "other",
      regex: true,
    },
    {
      zuk: "classify-disagree",
      source: "gmina-lubaczow",
      post: FOX,
      kind: "water_quality",
      regex: false,
    },
  ]);
  assert.equal(byId(w, 39885), undefined);
  assert.equal(seenOf(w, 39885)?.reason, NOT_WATER);
  assert.equal(byId(w, FOX)?.reason, WATER_QUALITY);
  // Not about water: no localityIds anywhere in the file.
  assert.deepEqual(Object.keys(seenOf(w, 39885) ?? {}).sort(), [
    "id",
    "modified",
    "reader",
    "reason",
  ]);
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
  // The six deferred: in neither list, no Notice.
  assert.deepEqual(ids(saved(w).active), [NEW, NEW + 1, NEW + 2, NEW + 3]);
  assert.deepEqual(saved(w).seen, []);
  const view = zukView(saved(w), NOW);
  assert.deepEqual(view.notices, []);
});

test("40 posts, one live: a small file, one active", async () => {
  // 39885 (cuts to come), 30 past posts (copies of 39872) and nine not
  // about water (copies of the fox post).
  const copy = (from: ZukPost, n: number) => ({
    ...from,
    id: NEW + n,
    date: `2026-10-${String(1 + (n % 20)).padStart(2, "0")}T${String(n % 24).padStart(2, "0")}:00:00`,
  });
  const posts = [
    RECENT[0],
    ...Array.from({ length: 30 }, (_, n) => copy(RECENT[1], n)),
    ...Array.from({ length: 9 }, (_, n) => copy(RECENT[7], 30 + n)),
  ];
  assert.equal(posts.length, 40);
  const readings = Object.fromEntries(
    posts.slice(31).map((p) => [p.id, reading(FOX)]),
  );
  const w = world({ posts, readings });
  for (let run = 0; run < 3; run++) {
    await runZuk(deps(w));
    w.now = new Date(w.now.getTime() + 15 * 60_000);
  }
  // 10 posts to read: three runs.
  assert.equal(w.aiCalls.length, 10);
  const file = saved(w);
  assert.deepEqual(ids(file.active), [39885]);
  assert.equal(file.seen.length, 39);
  // The live post is most of it (39885: 76 cuts); the rest is a few bytes
  // a post.
  const rest = JSON.stringify(file.seen).length;
  assert.ok(rest < 39 * 80, String(rest));
});
