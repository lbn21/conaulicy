import assert from "node:assert/strict";
import { test } from "node:test";
import type { ZukPost } from "./zuk.ts";
import type { AiInput, AiReading } from "./zuk-ai.ts";
import {
  handleZukCron,
  runZuk,
  WP_POSTS,
  type ZukCronDeps,
} from "./zuk-cron.ts";
import { AI_UNAVAILABLE, parseZukFile, type ZukFile } from "./zuk-data.ts";
import { PLACES, reading, realPosts } from "./zuk-fixture.ts";

const SECRET = "cron-secret";
// Sunday 25 Oct 2026: 39885's cuts (26-29 Oct) are still to come.
const NOW = new Date("2026-10-25T08:00:00Z");
const FOX = 39868;
const NEW = 40000;
// The eight newest real posts: seven ZUK, one not.
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
    readAi: async (input: AiInput, key: string): Promise<AiReading> => {
      assert.equal(key, "xai-key");
      const posts = w.posts === "down" ? [] : w.posts;
      const post = posts.find((p) => p.date === input.published);
      assert.ok(post);
      w.aiCalls.push(post.id);
      if (w.aiFails) throw new Error("xAI: HTTP 503");
      return {
        // A new post in the tests is a copy of 39885.
        result: reading(post.id === NEW ? 39885 : post.id),
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
    log: () => {},
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

test("first run: new ZUK posts read, at most four, the rest next run", async () => {
  const w = world();
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39885, 39872, 39865, 39863]);
  assert.equal(summary.aiCalls, 4);
  assert.equal(w.writes.length, 1);
  const file = saved(w);
  assert.equal(file.checkedAt, NOW.toISOString());
  assert.equal(file.generatedAt, NOW.toISOString());
  // The fox post is not ZUK's: not stored.
  assert.deepEqual(
    file.posts.map((p) => p.id),
    [39885, 39872, 39865, 39863, 39857, 39855, 39766],
  );
  const first = byId(w, 39885);
  assert.equal(first?.status, "parsed");
  assert.equal(first?.model, "grok-4.7");
  assert.equal(first?.costUsd, 0.0038);
  assert.ok((first?.items.length ?? 0) > 0);
  // 39872 (22 Oct) is over: its cuts are dropped.
  assert.equal(byId(w, 39872)?.items.length, 0);
  assert.equal(byId(w, 39857)?.reason, AI_UNAVAILABLE);
  assert.ok((byId(w, 39857)?.localityIds.length ?? 0) > 0);

  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [39857, 39855, 39766]);
  assert.equal(byId(w, 39857)?.status, "parsed");
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
  const w = world();
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
