import assert from "node:assert/strict";
import { test } from "node:test";
import { END_MARGIN_MS, prewarm, warmUntil } from "./prewarm.ts";

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
  assert.deepEqual(result, { warmed: 2100, failed: 0, skipped: 0 });
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
  assert.deepEqual(result, { warmed: 1, failed: 2, skipped: 0 });
});

test("warming ends the margin before the function does", () => {
  assert.equal(warmUntil(1_000, 300), 1_000 + 300_000 - END_MARGIN_MS);
});
