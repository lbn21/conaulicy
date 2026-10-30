import assert from "node:assert/strict";
import { test } from "node:test";
import { DATASET, DAY, IMGW, WATER } from "./headers.ts";
import { sitePages } from "./site-pages.ts";
import { STATIC_PAGES } from "./static-pages.ts";
import {
  WARM_MARGIN_MS,
  WARM_TIMEOUT_MS,
  type WarmDeps,
  warm,
} from "./warm.ts";

const BASE = "https://example.test";
// Three places, one without pickup data (not in the sitemap).
const PLACES = [
  ["p1", "Ulica A", "ulica"],
  ["p2", "Ulica B", "ulica"],
  ["v3", "Wieś C", "wieś"],
] as const;
const PAGES = sitePages(PLACES, ["p2"]);
const STATIC = ["/", ...STATIC_PAGES.map(({ path }) => path)];

type World = {
  fetched: string[];
  logs: Array<Record<string, unknown>>;
  pageLoads: number;
  /** Paths answered with a 500 or thrown. */
  failing: Map<string, "500" | "throw">;
  clock: number;
  /** How far each fetch moves the clock. */
  costMs: number;
  /** Fetches running at once, at most. */
  peak: number;
};

function world(over: Partial<World> = {}): World {
  return {
    fetched: [],
    logs: [],
    pageLoads: 0,
    failing: new Map(),
    clock: Date.parse("2026-10-25T00:00:00Z"),
    costMs: 0,
    peak: 0,
    ...over,
  };
}

function deps(w: World, over: Partial<WarmDeps> = {}): WarmDeps {
  let running = 0;
  return {
    fetch: (async (url: string | URL) => {
      const { origin, pathname } = new URL(String(url));
      assert.equal(origin, BASE);
      w.fetched.push(pathname);
      running++;
      w.peak = Math.max(w.peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      w.clock += w.costMs;
      running--;
      const fail = w.failing.get(pathname);
      if (fail === "throw") throw new Error("timeout");
      return new Response("<html>", { status: fail === "500" ? 500 : 200 });
    }) as typeof fetch,
    base: BASE,
    pages: async () => {
      w.pageLoads++;
      return PAGES;
    },
    now: () => new Date(w.clock),
    log: (line) => w.logs.push(line),
    ...over,
  };
}

test("no tag purged: nothing warmed, the route map not even read", async () => {
  const w = world();
  assert.equal(await warm([], deps(w)), null);
  assert.equal(await warm(new Set<string>(), deps(w)), null);
  assert.deepEqual(w.fetched, []);
  assert.equal(w.pageLoads, 0);
  assert.deepEqual(w.logs, []);
});

test("the route map: the sitemap's pages, each with the tags it carries", () => {
  assert.deepEqual(
    PAGES.map(({ path }) => path),
    [
      ...STATIC,
      "/adres/p1",
      "/adres/p1/smieci",
      "/adres/v3",
      "/adres/v3/smieci",
    ],
  );
  for (const page of PAGES) {
    if (STATIC.includes(page.path)) assert.deepEqual(page.tags, [IMGW]);
    else if (page.path.endsWith("/smieci")) assert.deepEqual(page.tags, [DAY]);
    else assert.deepEqual([...page.tags].sort(), [DAY, IMGW, WATER].sort());
  }
  // An id is encoded as the page's own link.
  assert.equal(
    sitePages([["a b/c"]], [])[STATIC.length].path,
    "/adres/a%20b%2Fc",
  );
});

test("each tag: exactly the route map's pages carrying it, each once", async () => {
  const cases: Array<[string[], string[]]> = [
    [[IMGW], [...STATIC, "/adres/p1", "/adres/v3"]],
    [[WATER], ["/adres/p1", "/adres/v3"]],
    [[DAY], ["/adres/p1", "/adres/p1/smieci", "/adres/v3", "/adres/v3/smieci"]],
    // A midnight with a water change: the union, the address page once.
    [
      [WATER, DAY],
      ["/adres/p1", "/adres/p1/smieci", "/adres/v3", "/adres/v3/smieci"],
    ],
    // A tag no page in the map carries: nothing.
    [[DATASET], []],
  ];
  for (const [tags, paths] of cases) {
    const w = world();
    const summary = await warm(tags, deps(w));
    assert.deepEqual([...w.fetched].sort(), [...paths].sort(), tags.join());
    assert.deepEqual(summary, {
      pages: paths.length,
      warmed: paths.length,
      failed: 0,
      left: 0,
    });
    assert.ok(w.peak <= 4, `${w.peak} at once`);
  }
});

test("at most four at a time", async () => {
  const w = world();
  await warm([IMGW, DAY], deps(w));
  assert.equal(w.peak, 4);
});

test("failures: logged by path, counted, never retried, never thrown", async () => {
  const w = world({
    failing: new Map([
      ["/adres/p1", "500"],
      ["/adres/v3", "throw"],
    ]),
  });
  const summary = await warm([WATER], deps(w));
  assert.deepEqual(summary, { pages: 2, warmed: 0, failed: 2, left: 0 });
  assert.deepEqual([...w.fetched].sort(), ["/adres/p1", "/adres/v3"]);
  assert.deepEqual(
    w.logs
      .filter((l) => l.warm === "failed")
      .sort((a, b) => String(a.path).localeCompare(String(b.path))),
    [
      { warm: "failed", path: "/adres/p1", error: "HTTP 500" },
      { warm: "failed", path: "/adres/v3", error: "timeout" },
    ],
  );
  // The route map unreadable: logged, nothing fetched.
  const v = world();
  const none = await warm(
    [IMGW],
    deps(v, {
      pages: async () => {
        throw new Error("db down");
      },
    }),
  );
  assert.equal(none, null);
  assert.deepEqual(v.fetched, []);
  assert.deepEqual(v.logs, [{ warm: "error", error: "db down" }]);
});

test("the deadline: a page starts only with its timeout and the margin left, the rest left for ISR", async () => {
  const need = WARM_TIMEOUT_MS + WARM_MARGIN_MS;
  // Too late from the start: nothing fetched, everything left.
  const late = world();
  const none = await warm(
    [IMGW],
    deps(late, { deadline: new Date(late.clock + need - 1) }),
  );
  assert.deepEqual(late.fetched, []);
  assert.deepEqual(none, { pages: 7, warmed: 0, failed: 0, left: 7 });
  // 5 s to spare, each fetch 10 s: the first four start at once; once one
  // is done, too little is left for another.
  const w = world({ costMs: 10_000 });
  const start = w.clock;
  const summary = await warm(
    [IMGW],
    deps(w, { deadline: new Date(start + need + 5_000) }),
  );
  assert.equal(w.fetched.length, 4);
  assert.deepEqual(summary, { pages: 7, warmed: 4, failed: 0, left: 3 });
  assert.deepEqual(w.logs.at(-1), {
    warm: "run",
    tags: [IMGW],
    pages: 7,
    warmed: 4,
    failed: 0,
    left: 3,
  });
  // Exactly the time needed left: started.
  const edge = world();
  await warm([WATER], deps(edge, { deadline: new Date(edge.clock + need) }));
  assert.equal(edge.fetched.length, 2);
});
