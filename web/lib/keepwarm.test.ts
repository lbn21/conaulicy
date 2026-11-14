import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailySlice,
  handleKeepWarmCron,
  KEEPWARM_DAYS,
  type KeepWarmDeps,
  sliceOf,
} from "./keepwarm.ts";
import type { Prewarmed } from "./prewarm.ts";

// The keep-warm: each path in one stable slice; the 7 days read them all;
// the cron's gate and its one line. Its list covers every route of app/:
// scripts/keepwarm-routes.test.ts.

const DAY = 86_400_000;

test("a path's slice is stable, in range, and the slices are about even", () => {
  const paths = Array.from({ length: 2100 }, (_, i) => `/adres/${i}/woda`);
  const sizes = Array<number>(KEEPWARM_DAYS).fill(0);
  for (const path of paths) {
    const slice = sliceOf(path);
    assert.ok(Number.isInteger(slice) && slice >= 0 && slice < KEEPWARM_DAYS);
    assert.equal(sliceOf(path), slice);
    sizes[slice]++;
  }
  const even = paths.length / KEEPWARM_DAYS;
  for (const size of sizes)
    assert.ok(size > even * 0.8 && size < even * 1.2, String(sizes));
});

test("any 7 days in a row read every slice once", () => {
  const start = Date.UTC(2026, 10, 14, 3, 35);
  const slices = Array.from({ length: KEEPWARM_DAYS }, (_, day) =>
    dailySlice(start + day * DAY),
  );
  assert.deepEqual(
    [...slices].sort(),
    Array.from({ length: KEEPWARM_DAYS }, (_, i) => i),
  );
  // The same slice all day.
  assert.equal(dailySlice(start), dailySlice(start + 20 * 3_600_000));
});

const SECRET = "cron-secret";
const PATHS = Array.from({ length: 70 }, (_, i) => `/p${i}`);

function run(over: Partial<KeepWarmDeps> = {}, auth = `Bearer ${SECRET}`) {
  const w = {
    given: null as string[] | null,
    logs: [] as Array<Record<string, unknown>>,
  };
  const deps: KeepWarmDeps = {
    vercelEnv: "production",
    paths: async () => PATHS,
    prewarm: async (paths): Promise<Prewarmed> => {
      w.given = paths;
      return {
        warmed: paths.length,
        failed: 0,
        skipped: 0,
        notPurged: 0,
        cache: { hit: paths.length },
      };
    },
    now: () => Date.UTC(2026, 10, 14, 3, 35),
    log: (line) => w.logs.push(line),
    ...over,
  };
  const response = handleKeepWarmCron(
    new Request("https://conaulicy.pl/api/cron/keepwarm", {
      headers: { authorization: auth },
    }),
    SECRET,
    deps,
  );
  return { w, response };
}

test("auth: the cron gate before anything is read", async () => {
  const { w, response } = run({}, "Bearer wrong");
  assert.equal((await response).status, 401);
  assert.equal(w.given, null);
});

test("not production: skipped, nothing read", async () => {
  const { w, response } = run({ vercelEnv: "preview" });
  assert.equal((await response).status, 200);
  assert.equal(w.given, null);
  assert.deepEqual(w.logs, []);
});

test("production: the day's slice, every path of it, and one line", async () => {
  const now = Date.UTC(2026, 10, 14, 3, 35);
  const { w, response } = run();
  assert.equal((await response).status, 200);
  const slice = dailySlice(now);
  assert.deepEqual(
    w.given,
    PATHS.filter((path) => sliceOf(path) === slice),
  );
  const size = w.given?.length ?? 0;
  assert.equal(w.logs.length, 1);
  const { ms, ...line } = w.logs[0];
  assert.equal(typeof ms, "number");
  assert.deepEqual(line, {
    keepwarm: "run",
    slice,
    total: size,
    all: PATHS.length,
    requested: size,
    hit: size,
    stale: 0,
    miss: 0,
    prerender: 0,
    errors: 0,
  });
});

test("what the time did not reach is logged as remaining; failures as errors", async () => {
  const { w, response } = run({
    prewarm: async () => ({
      warmed: 3,
      failed: 1,
      skipped: 5,
      notPurged: 0,
      cache: { miss: 2, prerender: 1, revalidated: 1 },
    }),
  });
  await response;
  const line = w.logs[0];
  assert.equal(line.requested, 4);
  assert.equal(line.errors, 1);
  assert.equal(line.remaining, 5);
  assert.equal(line.miss, 2);
  assert.equal(line.prerender, 1);
  assert.equal(line.other, 1);
});

test("a list that cannot be read: a 500 and its line, never thrown", async () => {
  const { w, response } = run({
    paths: async () => {
      throw new Error("no dataset");
    },
  });
  assert.equal((await response).status, 500);
  assert.equal(w.logs[0].keepwarm, "error");
  assert.equal(w.logs[0].error, "no dataset");
});
