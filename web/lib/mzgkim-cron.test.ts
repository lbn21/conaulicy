import assert from "node:assert/strict";
import { test } from "node:test";
import { WATER } from "./headers.ts";
import {
  CUT_100,
  DERATYZACJA,
  FEED_2026_10_26,
  feedItem,
  feedWith,
  MZGKIM_PLACES,
  MZGKIM_READINGS,
  realPage,
} from "./mzgkim-fixture.ts";
import { WP_POSTS } from "./sources/gmina-lubaczow/fetch.ts";
import { MZGKIM_FEED } from "./sources/mzgkim/fetch.ts";
import { mzgkim } from "./sources/mzgkim/index.ts";
import { MZGKIM, TOWN } from "./water-sources.ts";
import { type AiInput, type AiReading, TIMEOUT_MS } from "./zuk-ai.ts";
import { handleZukCron, runZuk, type ZukCronDeps } from "./zuk-cron.ts";
import {
  AI_UNAVAILABLE,
  NOT_WATER,
  parseZukFile,
  type ZukFile,
  zukView,
} from "./zuk-data.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

// MZGKiM's source through the one water cron (lib/zuk-cron.ts), with its
// real feed and pages and the model mocked (MZGKIM_READINGS): never a real
// call. Saturday 3 Oct 2026, 10:00 in Warsaw: 5237's cut (6 Oct) is to
// come; the window (14 days) holds 5237 and 5234 (deratyzacja).
const NOW = new Date("2026-10-03T08:00:00Z");
const SECRET = "cron-secret";

/** What the mocked model returns, but its result. */
const READING: Omit<AiReading, "result"> = {
  model: "grok-4.7",
  usage: { promptTokens: 1000, completionTokens: 100, reasoningTokens: 0 },
  costUsd: 0.0026,
  latencyMs: 4000,
};

type World = {
  feed: string | "down";
  pages: Record<string, string | "down">;
  file: string | null;
  urls: string[];
  aiCalls: number[];
  aiFails: boolean;
  logs: Array<Record<string, unknown>>;
  purges: string[];
  now: Date;
};

const world = (over: Partial<World> = {}): World => ({
  feed: FEED_2026_10_26,
  pages: {},
  file: null,
  urls: [],
  aiCalls: [],
  aiFails: false,
  logs: [],
  purges: [],
  now: NOW,
  ...over,
});

function deps(w: World): ZukCronDeps {
  return {
    fetch: (async (url: string | URL) => {
      const at = String(url);
      w.urls.push(at);
      if (at.startsWith(MZGKIM_FEED)) {
        if (w.feed === "down") return new Response("down", { status: 503 });
        return at === MZGKIM_FEED
          ? new Response(w.feed)
          : new Response("", { status: 404 });
      }
      const page = w.pages[at] ?? realPage(at);
      if (!page || page === "down")
        return new Response("down", { status: 503 });
      return new Response(page);
    }) as typeof fetch,
    readFile: async () => w.file,
    writeFile: async (body) => {
      w.file = body;
    },
    purge: (tag) => w.purges.push(tag),
    places: async () => MZGKIM_PLACES,
    readAi: async (
      input: AiInput,
      system: string,
      key: string,
    ): Promise<AiReading> => {
      assert.equal(key, "xai-key");
      assert.equal(system, mzgkim.systemPrompt(MZGKIM_PLACES));
      const id =
        input.published === "2026-10-02T12:11:39"
          ? CUT_100
          : input.published === "2026-09-21T09:16:47"
            ? DERATYZACJA
            : 0;
      // The page's text, not the feed's flattened summary.
      if (id === CUT_100) assert.match(input.text, /\nStarzyny\n/);
      w.aiCalls.push(id);
      if (w.aiFails) throw new Error("xAI: HTTP 503");
      return { ...READING, result: MZGKIM_READINGS[id] };
    },
    source: mzgkim,
    log: (line) => w.logs.push(line),
    now: () => w.now,
    xaiKey: "xai-key",
  };
}

/** MZGKiM's file as the run left it. */
function saved(w: World): ZukFile {
  const file = parseZukFile(w.file ?? "");
  assert.ok(file, "MZGKiM's file not written");
  return file;
}

test("a run: every post read by the model from its page", async () => {
  const w = world();
  const summary = await runZuk(deps(w));
  assert.deepEqual(summary, {
    posts: 2,
    active: 1,
    aiCalls: 2,
    costUsd: 0.0052,
    changed: true,
  });
  // The feed once, then the page of each post the model reads.
  assert.deepEqual(w.urls, [
    MZGKIM_FEED,
    "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/",
    "https://mzgkim.lubaczow.pl/komunikat-4/",
  ]);
  assert.deepEqual(w.aiCalls, [CUT_100, DERATYZACJA]);
  const file = saved(w);
  const [post] = file.active;
  assert.equal(post.id, CUT_100);
  assert.equal(post.sourceId, "mzgkim");
  assert.equal(post.status, "parsed");
  // Three streets, the estate's 9 and the 22 of Osiedle Mazury (the
  // gazetteer).
  assert.equal(post.itemCount, 3 + 9 + 22);
  assert.equal(post.unmatched, undefined);
  // The town and its parts, never a village it names (Dąbrowa).
  assert.deepEqual(post.localityIds, [...TOWN].sort());
  assert.match(post.digest ?? "", /^[0-9a-f]{16}$/);
  assert.ok(post.items.every((d) => d.uid.startsWith("mzgkim-5237-")));
  // Deratyzacja: not about water, the model says.
  assert.deepEqual(file.seen, [
    {
      id: DERATYZACJA,
      modified: "2026-09-21T09:16:47",
      reason: NOT_WATER,
      reader: post.reader,
      digest: file.seen[0].digest,
    },
  ]);
  assert.ok(
    w.logs.some(
      (l) => l.zuk === "ai" && l.source === "mzgkim" && l.rejected === 0,
    ),
  );
  assert.deepEqual(w.purges, [WATER]);
  // The pages: its cuts under MZGKiM's name, every area matched.
  const view = zukView(file, NOW, MZGKIM);
  assert.equal(view.disruptions.length, 3 + 9 + 22);
  assert.deepEqual(view.notices, []);
});

test("idempotent: the next run reads no page and calls the model 0 times", async () => {
  const w = world();
  await runZuk(deps(w));
  const before = saved(w);
  w.urls = [];
  w.aiCalls = [];
  w.purges = [];
  w.now = new Date(NOW.getTime() + 15 * 60_000);
  const summary = await runZuk(deps(w));
  assert.equal(summary.aiCalls, 0);
  assert.equal(summary.changed, false);
  assert.deepEqual(w.aiCalls, []);
  assert.deepEqual(w.urls, [MZGKIM_FEED]);
  assert.deepEqual(w.purges, []);
  const after = saved(w);
  assert.deepEqual(after.active, before.active);
  assert.deepEqual(after.seen, before.seen);
  assert.notEqual(after.checkedAt, before.checkedAt);
});

test("an edit (its summary changed): read again, its last change that run", async () => {
  const w = world();
  await runZuk(deps(w));
  const edited = feedItem(CUT_100).replace("prac przyłączeniowych", "prac");
  w.feed = feedWith([edited, feedItem(DERATYZACJA)]);
  w.aiCalls = [];
  w.now = new Date("2026-10-03T12:00:00Z");
  const summary = await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [CUT_100]);
  assert.equal(summary.aiCalls, 1);
  const [post] = saved(w).active;
  // 14:00 in Warsaw, when the edit was first seen.
  assert.equal(post.modified, "2026-10-03T14:00:00");
  assert.equal(post.updatedAt, "2026-10-03 14:00:00");
  assert.equal(post.publishedAt, "2026-10-02 12:11:39");
  // And then left alone again.
  w.aiCalls = [];
  w.now = new Date("2026-10-03T12:15:00Z");
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, []);
  assert.equal(saved(w).active[0].modified, "2026-10-03T14:00:00");
});

test("its page down: no model call, retried next run", async () => {
  const link = "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/";
  const w = world({ pages: { [link]: "down" } });
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [DERATYZACJA]);
  w.aiCalls = [];
  assert.equal(
    saved(w).seen.find((p) => p.id === CUT_100)?.reason,
    AI_UNAVAILABLE,
  );
  assert.ok(w.logs.some((l) => l.zuk === "page-error" && l.post === CUT_100));
  w.pages = {};
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [CUT_100]);
  assert.equal(saved(w).active[0].id, CUT_100);
});

test("xAI down: retried next run, never shown", async () => {
  const w = world({ aiFails: true });
  await runZuk(deps(w));
  assert.equal(saved(w).active.length, 0);
  w.aiFails = false;
  w.aiCalls = [];
  await runZuk(deps(w));
  assert.deepEqual(w.aiCalls, [CUT_100, DERATYZACJA]);
  assert.equal(saved(w).active.length, 1);
});

test("a model call starts only with its timeout and the margin left", async () => {
  {
    const w = world();
    // The gmina's run left 269 s before the deadline: no call for MZGKiM.
    const deadline = new Date(NOW.getTime() + TIMEOUT_MS + 29_000);
    const summary = await runZuk({ ...deps(w), deadline });
    assert.equal(summary.aiCalls, 0);
    assert.deepEqual(w.aiCalls, []);
    // Not stored: read on a later run.
    assert.equal(saved(w).active.length, 0);
  }
  {
    // 271 s left: the call starts.
    const w = world();
    const deadline = new Date(NOW.getTime() + TIMEOUT_MS + 31_000);
    const summary = await runZuk({ ...deps(w), deadline });
    assert.ok(summary.aiCalls > 0);
    assert.ok(w.aiCalls.length > 0);
  }
});

// The route: the gmina's run and MZGKiM's at once, each on its own.
const gmina = (w: { gminaDown: boolean; gminaFile: string | null }) =>
  ({
    fetch: (async (url: string | URL) => {
      assert.ok(String(url).startsWith(WP_POSTS));
      if (w.gminaDown) return new Response("down", { status: 503 });
      return Response.json([], { headers: { "x-wp-totalpages": "1" } });
    }) as typeof fetch,
    readFile: async () => w.gminaFile,
    writeFile: async (body: string) => {
      w.gminaFile = body;
    },
    purge: () => {},
    places: async () => ZUK_PLACES,
    xaiKey: "xai-key",
    now: () => NOW,
    log: () => {},
  }) satisfies ZukCronDeps;

const route = (main: ZukCronDeps, more: ZukCronDeps[]) =>
  handleZukCron(
    new Request("https://conaulicy.pl/api/cron/zuk", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    SECRET,
    main,
    more,
  );

test("the route: the gmina down is 502 as ever, MZGKiM still read", async () => {
  const g = { gminaDown: true, gminaFile: null as string | null };
  const w = world();
  const response = await route(gmina(g), [deps(w)]);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "source unavailable");
  assert.equal(body.sources.mzgkim.aiCalls, 2);
  assert.equal(saved(w).active.length, 1);
});

test("the route: the sources run at once, a slow gmina call never starves MZGKiM's", async () => {
  // One clock and one deadline for both: just enough left for one call.
  const clock = { now: NOW };
  const deadline = new Date(NOW.getTime() + TIMEOUT_MS + 31_000);
  const g = { gminaDown: false, gminaFile: null as string | null };
  let gminaCalls = 0;
  const slowGmina: ZukCronDeps = {
    ...gmina(g),
    fetch: (async () =>
      Response.json(
        [
          {
            id: 1,
            date: "2026-10-02T09:00:00",
            modified: "2026-10-02T09:00:00",
            link: "https://lubaczow.com.pl/1/",
            title: { rendered: "Komunikat" },
            content: { rendered: "<p>Zebranie wiejskie.</p>" },
          },
        ],
        { headers: { "x-wp-totalpages": "1" } },
      )) as typeof fetch,
    readAi: async () => {
      gminaCalls++;
      // The call takes its whole timeout.
      await new Promise((resolve) => setTimeout(resolve, 50));
      clock.now = new Date(clock.now.getTime() + TIMEOUT_MS);
      return {
        ...READING,
        result: {
          post_type: "other",
          quality_status: null,
          is_past: false,
          changes_earlier_dates: false,
          items: [],
        },
      };
    },
    now: () => clock.now,
    deadline,
  };
  const w = world();
  const response = await route(slowGmina, [
    { ...deps(w), now: () => clock.now, deadline },
  ]);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(gminaCalls, 1);
  assert.equal(body.aiCalls, 1);
  // MZGKiM's (instant) calls started while the gmina's was running.
  assert.deepEqual(w.aiCalls, [CUT_100, DERATYZACJA]);
  assert.equal(body.sources.mzgkim.aiCalls, 2);
  assert.equal(saved(w).active.length, 1);
  assert.ok(g.gminaFile, "the gmina's file written");
});

test("the route: a source down or throwing never stops the other", async () => {
  // MZGKiM down: the gmina's run and the status as ever.
  {
    const g = { gminaDown: false, gminaFile: null as string | null };
    const w = world({ feed: "down" });
    const response = await route(gmina(g), [deps(w)]);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.posts, 0);
    assert.deepEqual(body.sources, { mzgkim: { error: "source unavailable" } });
    assert.ok(g.gminaFile, "the gmina's file written");
    assert.equal(w.file, null);
    assert.deepEqual(
      w.logs.filter((l) => l.zuk === "source-down").map((l) => l.source),
      ["mzgkim"],
    );
  }
  // An MZGKiM failure of any kind: caught and reported.
  {
    const g = { gminaDown: false, gminaFile: null as string | null };
    const w = world();
    const broken = {
      ...deps(w),
      readFile: async () => {
        throw new Error("blob: 500");
      },
    };
    const response = await route(gmina(g), [broken]);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).sources, {
      mzgkim: { error: "failed" },
    });
    assert.ok(
      w.logs.some(
        (l) =>
          l.zuk === "error" && l.source === "mzgkim" && l.error === "blob: 500",
      ),
    );
  }
  // Either source's Blob throwing: the other still writes its file.
  {
    // The gmina's Blob broken: 500, MZGKiM's file written.
    const g1 = { gminaDown: false, gminaFile: null as string | null };
    const w1 = world();
    const brokenGmina = {
      ...gmina(g1),
      writeFile: async () => {
        throw new Error("blob: 500");
      },
    };
    const r1 = await route(brokenGmina, [deps(w1)]);
    assert.equal(r1.status, 500);
    const b1 = await r1.json();
    assert.equal(b1.error, "failed");
    assert.equal(b1.sources.mzgkim.aiCalls, 2);
    assert.equal(saved(w1).active.length, 1);
    // MZGKiM's Blob broken: 200, the gmina's file written.
    const g2 = { gminaDown: false, gminaFile: null as string | null };
    const w2 = world();
    const r2 = await route(gmina(g2), [
      {
        ...deps(w2),
        writeFile: async () => {
          throw new Error("blob: 500");
        },
      },
    ]);
    assert.equal(r2.status, 200);
    assert.deepEqual((await r2.json()).sources, {
      mzgkim: { error: "failed" },
    });
    assert.ok(g2.gminaFile, "the gmina's file written");
    assert.equal(w2.file, null);
  }
});
