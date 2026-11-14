import assert from "node:assert/strict";
import { test } from "node:test";
import {
  END_MARGIN_MS,
  oldPage,
  prewarm,
  RETRY_MS,
  warmUntil,
} from "./prewarm.ts";

// The pre-warm: every page given, no count limit; only the function's
// time stops it, and what it did not reach is counted.

const ok = (seen: string[]) =>
  (async (url: URL | RequestInfo) => {
    seen.push(new URL(String(url)).pathname);
    return new Response("ok");
  }) as typeof fetch;

test("every page given is fetched, once, whatever their number", async () => {
  const paths = Array.from({ length: 2100 }, (_, i) => `/p${i}`);
  const seen: string[] = [];
  const result = await prewarm("https://example.test", [...paths, "/p0"], {
    fetcher: ok(seen),
  });
  assert.deepEqual(result, {
    warmed: 2100,
    failed: 0,
    skipped: 0,
    notPurged: 0,
    cache: { none: 2100 },
  });
  assert.deepEqual([...seen].sort(), [...paths].sort());
  assert.equal(seen[0], "/p0");
});

test("no GET starts that could outlast the function: the rest are skipped", async () => {
  let now = 0;
  const seen: string[] = [];
  const fetcher = (async (url: URL | RequestInfo) => {
    seen.push(new URL(String(url)).pathname);
    now += 1_000;
    return new Response("ok");
  }) as typeof fetch;
  const paths = Array.from({ length: 100 }, (_, i) => `/p${i}`);
  // Room for the 10 s timeout and 20 GETs of 1 s each, 8 at once.
  const result = await prewarm("https://example.test", paths, {
    fetcher,
    now: () => now,
    until: 30_000,
  });
  assert.equal(result.warmed, seen.length);
  assert.equal(result.skipped, paths.length - seen.length);
  assert.ok(result.skipped > 0 && result.warmed > 0);
});

test("failed GETs are counted, never thrown", async () => {
  const fetcher = (async (url: URL | RequestInfo) => {
    if (String(url).endsWith("/bad")) throw new Error("down");
    if (String(url).endsWith("/gone")) return new Response("", { status: 404 });
    return new Response("ok");
  }) as typeof fetch;
  const result = await prewarm("https://example.test", ["/", "/bad", "/gone"], {
    fetcher,
  });
  assert.deepEqual(result, {
    warmed: 1,
    failed: 2,
    skipped: 0,
    notPurged: 0,
    cache: { none: 1 },
  });
});

test("warming ends the margin before the function does", () => {
  assert.equal(warmUntil(1_000, 300), 1_000 + 300_000 - END_MARGIN_MS);
});

/** A CDN answer: its cache state and age (s). */
const cdn = (state: string, age = 0) =>
  new Response("ok", {
    headers: { "x-vercel-cache": state, age: String(age) },
  });

test("the old page (a HIT from before the revalidation) is tried again, then warmed", async () => {
  let now = 100_000;
  const since = 100_000;
  const tries: Record<string, number> = {};
  const fetcher = (async (url: URL | RequestInfo) => {
    const path = new URL(String(url)).pathname;
    tries[path] = (tries[path] ?? 0) + 1;
    // /late's purge arrives on its third try; /a's at once.
    if (path === "/late" && tries[path] < 3) return cdn("HIT", 900);
    return cdn("STALE", 900);
  }) as typeof fetch;
  const slept: number[] = [];
  const result = await prewarm("https://example.test", ["/late", "/a"], {
    fetcher,
    since,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  });
  assert.deepEqual(result, {
    warmed: 2,
    failed: 0,
    skipped: 0,
    notPurged: 0,
    cache: { hit: 2, stale: 2 },
  });
  assert.equal(tries["/late"], 3);
  assert.equal(tries["/a"], 1);
  assert.ok(slept.length > 0 && slept.every((ms) => ms <= RETRY_MS));
});

test("no revalidation (since: null): every ok answer counts, a HIT of any age included", async () => {
  const gets: string[] = [];
  const fetcher = (async (url: URL | RequestInfo) => {
    gets.push(new URL(String(url)).pathname);
    if (String(url).endsWith("/bare"))
      return new Response("ok", { headers: { "x-vercel-cache": "HIT" } });
    return String(url).endsWith("/old") ? cdn("HIT", 3600) : cdn("MISS");
  }) as typeof fetch;
  const result = await prewarm(
    "https://example.test",
    ["/old", "/bare", "/b"],
    {
      fetcher,
      since: null,
      now: () => 10_000_000,
    },
  );
  assert.deepEqual(result, {
    warmed: 3,
    failed: 0,
    skipped: 0,
    notPurged: 0,
    cache: { hit: 2, miss: 1 },
  });
  assert.equal(gets.length, 3);
});

test("a purge that never arrives: tried until the time is up, counted as notPurged", async () => {
  let now = 0;
  let gets = 0;
  const fetcher = (async (url: URL | RequestInfo) => {
    gets++;
    now += 100;
    return String(url).endsWith("/stuck") ? cdn("HIT", 3600) : cdn("MISS");
  }) as typeof fetch;
  const result = await prewarm("https://example.test", ["/stuck", "/b", "/c"], {
    fetcher,
    since: 0,
    until: 20_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const { cache, ...counts } = result;
  assert.deepEqual(counts, { warmed: 2, failed: 0, skipped: 0, notPurged: 1 });
  assert.equal(cache.miss, 2);
  assert.equal(cache.hit, gets - 2);
  // No GET started that could end after `until` (10 s timeout each).
  assert.ok(now <= 20_000);
  assert.ok(gets > 3 && gets < 20);
});

test("the old pages' retries do not stop the rest being reached in order", async () => {
  let now = 0;
  const seen: string[] = [];
  const fetcher = (async (url: URL | RequestInfo) => {
    const path = new URL(String(url)).pathname;
    seen.push(path);
    return path === "/old" ? cdn("HIT", 3600) : cdn("STALE", 60);
  }) as typeof fetch;
  const paths = ["/old", ...Array.from({ length: 30 }, (_, i) => `/p${i}`)];
  const result = await prewarm("https://example.test", paths, {
    fetcher,
    since: 0,
    until: 12_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  assert.equal(result.warmed, 30);
  assert.equal(result.notPurged, 1);
  assert.deepEqual(
    seen.filter((p) => p !== "/old"),
    paths.slice(1),
  );
});

test("the old page: a HIT rendered before the revalidation, by its age", () => {
  const since = 1_000_000;
  // Read 10 s after the revalidation.
  const now = since + 10_000;
  assert.equal(oldPage(cdn("HIT", 600), since, now), true);
  assert.equal(oldPage(cdn("HIT", 11), since, now), true);
  // Rendered since (a visitor's request): the new page.
  assert.equal(oldPage(cdn("HIT", 9), since, now), false);
  assert.equal(oldPage(cdn("HIT", 3), since, now), false);
  for (const state of ["STALE", "MISS", "PRERENDER", "REVALIDATED"])
    assert.equal(oldPage(cdn(state, 600), since, now), false);
  // Not Vercel's CDN (no header): nothing to purge.
  assert.equal(oldPage(new Response("ok"), since, now), false);
  // A HIT without an age: old.
  assert.equal(
    oldPage(
      new Response("ok", { headers: { "x-vercel-cache": "HIT" } }),
      since,
      now,
    ),
    true,
  );
});

test("the old page: the age's truncation counts against the page", () => {
  const since = 1_000_000;
  // Age 10 at 10.5 s after the revalidation: rendered between 10 and 11 s
  // ago, so possibly up to 0.5 s before it: old.
  assert.equal(oldPage(cdn("HIT", 10), since, since + 10_500), true);
  // Age 10 exactly 11 s after: rendered 10-11 s ago, at the revalidation at
  // the earliest: the new page.
  assert.equal(oldPage(cdn("HIT", 10), since, since + 11_000), false);
  // Age 0 read at the revalidation itself: could be up to 1 s before it.
  assert.equal(oldPage(cdn("HIT", 0), since, since), true);
  assert.equal(oldPage(cdn("HIT", 0), since, since + 1_000), false);
});
