import assert from "node:assert/strict";
import { test } from "node:test";
import { PGE_KEY, parseChecks } from "./live-status.ts";
import { type PgeCronDeps, runPge } from "./pge-cron.ts";
import { outagesUrl, PGE_URL, parseOutagesFile } from "./pge-feed.ts";
import { REAL_2026_11_11 } from "./pge-fixture.ts";
import { handleZukCron, type ZukCronDeps } from "./zuk-cron.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const T0 = Date.parse("2026-11-11T16:52:00Z");
const OUTAGES = "pge/outages.json";
const CHECKS = "status/checks.json";

type Upstream = { status: number; body: string };

/** PGE as seen by the cron, and the private Blob store by pathname. */
function setup(first: Upstream = { status: 200, body: REAL_2026_11_11 }) {
  const state = {
    upstream: first,
    requests: 0,
    store: new Map<string, string>(),
    writes: [] as string[],
    logs: [] as Array<Record<string, unknown>>,
    now: T0,
  };
  const deps = (over: Partial<PgeCronDeps> = {}): PgeCronDeps => ({
    url: outagesUrl(PGE_URL),
    fetch: (async () => {
      state.requests++;
      return new Response(state.upstream.body, {
        status: state.upstream.status,
      });
    }) as unknown as typeof fetch,
    token: "token",
    places: ZUK_PLACES,
    readFile: async () => state.store.get(OUTAGES) ?? null,
    writeFile: async (body) => {
      state.writes.push(OUTAGES);
      state.store.set(OUTAGES, body);
    },
    now: () => state.now,
    log: (line) => state.logs.push(line),
    ...over,
  });
  return { state, deps };
}

const uuids = (body: string | undefined) =>
  parseOutagesFile(body ?? null)?.items.map((item) => item.uuid.slice(0, 8));

test("a good run keeps our outages only, and writes only when they changed", async () => {
  const { state, deps } = setup();
  assert.deepEqual(await runPge(deps()), { checked: true, changed: true });
  assert.equal(state.requests, 1);
  assert.deepEqual(uuids(state.store.get(OUTAGES)), [
    "f76971d9",
    "77d6b8f2",
    "bbc4d11d",
    "4497d8b9",
    "6fbd5cfd",
  ]);
  // The same list, in another order and fetched later: nothing written.
  state.upstream = {
    status: 200,
    body: JSON.stringify(JSON.parse(REAL_2026_11_11).reverse()),
  };
  state.now += 15 * 60_000;
  assert.deepEqual(await runPge(deps()), { checked: true, changed: false });
  assert.deepEqual(state.writes, [OUTAGES]);
  // None left: written, empty.
  state.upstream = { status: 200, body: "[]" };
  assert.deepEqual(await runPge(deps()), { checked: true, changed: true });
  assert.deepEqual(uuids(state.store.get(OUTAGES)), []);
  assert.deepEqual(state.logs.at(-1), { pge: "run", changed: true, items: 0 });
});

test("PGE failing: the file kept, the class logged, never thrown", async () => {
  for (const [status, kind] of [
    [401, "auth-error"],
    [429, "rate-limited"],
    [503, "fetch-error"],
  ] as const) {
    const { state, deps } = setup();
    await runPge(deps());
    const kept = state.store.get(OUTAGES);
    state.upstream = { status, body: "" };
    assert.deepEqual(await runPge(deps()), { error: "feed unavailable" });
    assert.equal(state.store.get(OUTAGES), kept);
    assert.equal(state.logs.at(-1)?.pge, kind);
  }
  // No token: no request at all.
  const { state, deps } = setup();
  assert.deepEqual(await runPge(deps({ token: undefined })), {
    error: "feed unavailable",
  });
  assert.equal(state.requests, 0);
  assert.deepEqual(state.logs, [{ pge: "auth-error", error: "PGE: no token" }]);
});

test("the cron records PGE's check under its key; a failure keeps the last good one", async () => {
  const { state, deps } = setup();
  const water: ZukCronDeps = {
    fetch: (async () => {
      throw new Error("no network");
    }) as unknown as typeof fetch,
    readFile: async () => {
      throw new Error("water file unreadable");
    },
    writeFile: async () => assert.fail("no water write"),
    places: async () => assert.fail("no places"),
    xaiKey: undefined,
    now: () => new Date(state.now),
    log: () => {},
  };
  const checks = {
    read: async () => state.store.get(CHECKS) ?? null,
    write: async (body: string) => {
      state.store.set(CHECKS, body);
    },
  };
  const run = async () => {
    const response = await handleZukCron(
      new Request("https://conaulicy.pl/api/cron/zuk", {
        headers: { authorization: "Bearer s" },
      }),
      "s",
      water,
      [],
      [{ key: PGE_KEY, run: () => runPge(deps()) }],
      checks,
    );
    return (await response.json()).pge;
  };
  assert.deepEqual(await run(), { checked: true, changed: true });
  const at = new Date(T0).toISOString();
  assert.deepEqual(parseChecks(state.store.get(CHECKS) ?? null)?.sources.pge, {
    checkedAt: at,
    attemptAt: at,
    ok: true,
  });
  state.upstream = { status: 500, body: "" };
  state.now += 15 * 60_000;
  assert.deepEqual(await run(), { error: "feed unavailable" });
  assert.deepEqual(parseChecks(state.store.get(CHECKS) ?? null)?.sources.pge, {
    checkedAt: at,
    attemptAt: new Date(state.now).toISOString(),
    ok: false,
  });
});
