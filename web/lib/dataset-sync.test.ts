import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fixtureDataset } from "./dataset-fixture.ts";
import { MADE_UP } from "./dataset-store.ts";
import {
  MissingDeployHook,
  type SyncDeps,
  syncAction,
  syncDataset,
} from "./dataset-sync.ts";
import { placeSetOf } from "./dataset-views.ts";
import { todayInWarsaw } from "./dates.ts";

// One decision for every publisher (lib/dataset-sync.ts): the same place
// set, revalidate; another, the deploy hook, never a revalidation; the
// hook missing, an error.

const build = { version: "20261113T140221Z-1a2b3c4d5e6f", placeSet: "aaaa" };

test("the same place set, another version: revalidate", () => {
  const latest = { version: "20261114T040000Z-0123456789ab", placeSet: "aaaa" };
  assert.equal(syncAction(build, latest), "revalidate");
  assert.equal(syncAction(build, latest, build.version), "revalidate");
  // The pages show it already: nothing.
  assert.equal(syncAction(build, latest, latest.version), "none");
});

test("another place set: the deploy hook, whatever the pages show", () => {
  const latest = { version: "20261114T040000Z-0123456789ab", placeSet: "bbbb" };
  assert.equal(syncAction(build, latest), "deploy");
  assert.equal(syncAction(build, latest, latest.version), "deploy");
  // Outside a build's output (`next dev`): every version is its own.
  assert.equal(syncAction(null, latest), "revalidate");
});

// Here (no Blob token, no DATASET_DIR, not production) the pointer is the
// made-up dataset's.
const saved = process.env.DATASET_BUILD;
afterEach(() => {
  if (saved === undefined) delete process.env.DATASET_BUILD;
  else process.env.DATASET_BUILD = saved;
});
const asBuild = (placeSet: string) => {
  process.env.DATASET_BUILD = JSON.stringify({ version: MADE_UP, placeSet });
};

// The latest place set here: the made-up dataset's; the build's another,
// unless a test says so. Each world holds the marker and every call.
const LATEST = placeSetOf(fixtureDataset(todayInWarsaw()));
const NOW = Date.parse("2026-11-13T18:00:00Z");
const HOUR = 3_600_000;
const HOOK = "https://hook.example/x";

function world({
  hookUrl = HOOK as string | null,
  mode = "cron" as SyncDeps["mode"],
  marker = null as Record<string, unknown> | null,
  status = 201,
} = {}) {
  const w = {
    calls: [] as string[],
    logs: [] as Array<Record<string, unknown>>,
    marker: marker ? JSON.stringify(marker) : (null as string | null),
    now: NOW,
  };
  const deps: SyncDeps = {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      w.calls.push(`${init?.method} ${url}`);
      return new Response(null, { status });
    }) as typeof fetch,
    hookUrl: hookUrl ?? undefined,
    revalidate: () => w.calls.push("revalidate"),
    marker: {
      read: async () => w.marker,
      write: async (body) => {
        w.marker = body;
      },
    },
    mode,
    log: (line) => w.logs.push(line),
    now: () => w.now,
  };
  return { w, deps };
}

test("syncDataset: the same set revalidates, no hook, no marker", async () => {
  asBuild(LATEST);
  const { w, deps } = world();
  assert.deepEqual(await syncDataset(deps), {
    version: MADE_UP,
    action: "revalidate",
  });
  assert.deepEqual(w.calls, ["revalidate"]);
  assert.equal(w.marker, null);
});

test("syncDataset: a new set POSTs the hook once and marks it", async () => {
  asBuild("another");
  const { w, deps } = world();
  assert.deepEqual(await syncDataset(deps), {
    version: MADE_UP,
    action: "deploy",
  });
  assert.deepEqual(w.calls, [`POST ${HOOK}`]);
  assert.deepEqual(JSON.parse(w.marker ?? ""), {
    placeSet: LATEST,
    at: NOW,
    hook: true,
  });
});

test("syncDataset: the same set within 6 h is pending, no POST; after 6 h, POST again", async () => {
  asBuild("another");
  const { w, deps } = world({
    marker: { placeSet: LATEST, at: NOW - 5 * HOUR, hook: true },
  });
  for (const mode of ["cron", "publish"] as const) {
    assert.equal(
      (await syncDataset({ ...deps, mode })).action,
      "deploy-pending",
    );
  }
  assert.deepEqual(w.calls, []);
  w.now = NOW + 1.5 * HOUR;
  assert.equal((await syncDataset(deps)).action, "deploy");
  assert.deepEqual(w.calls, [`POST ${HOOK}`]);
  assert.equal(JSON.parse(w.marker ?? "").at, NOW + 1.5 * HOUR);
});

test("syncDataset: a marker of another set: POST", async () => {
  asBuild("another");
  const { w, deps } = world({
    marker: { placeSet: "older", at: NOW - HOUR, hook: true },
  });
  assert.equal((await syncDataset(deps)).action, "deploy");
  assert.deepEqual(w.calls, [`POST ${HOOK}`]);
});

test("syncDataset: a hook answering non-2xx throws and writes no marker", async () => {
  asBuild("another");
  const { w, deps } = world({ status: 500 });
  await assert.rejects(syncDataset(deps), /HTTP 500/);
  assert.equal(w.marker, null);
});

test("syncDataset in the cron, no DEPLOY_HOOK_URL: marked, logged once per place set, nothing revalidated", async () => {
  asBuild("another");
  const { w, deps } = world({ hookUrl: null });
  for (const later of [0, 0.25, 7]) {
    w.now = NOW + later * HOUR;
    assert.equal((await syncDataset(deps)).action, "deploy-missing-hook");
  }
  assert.deepEqual(w.calls, []);
  assert.equal(
    w.logs.filter((l) => l.dataset === "deploy-hook-missing").length,
    1,
  );
  assert.equal(JSON.parse(w.marker ?? "").hook, false);
  // The hook set later: POSTed at once, the missing-hook marker no pending.
  assert.equal(
    (await syncDataset({ ...deps, hookUrl: HOOK })).action,
    "deploy",
  );
});

test("syncDataset from a publish, no DEPLOY_HOOK_URL: an error, nothing revalidated", async () => {
  asBuild("another");
  const { w, deps } = world({ hookUrl: null, mode: "publish" });
  await assert.rejects(syncDataset(deps), MissingDeployHook);
  assert.deepEqual(w.calls, []);
});

test("POST /api/revalidate with no DEPLOY_HOOK_URL and a new set: 500", async () => {
  asBuild("another");
  const env = {
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
    DEPLOY_HOOK_URL: process.env.DEPLOY_HOOK_URL,
  };
  process.env.REVALIDATE_SECRET = "s";
  delete process.env.DEPLOY_HOOK_URL;
  try {
    const { POST } = await import("../app/api/revalidate/route.ts");
    const response = await POST(
      new Request("https://conaulicy.pl/api/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer s" },
      }),
    );
    assert.equal(response.status, 500);
    assert.equal((await response.json()).missingHook, true);
  } finally {
    for (const [key, value] of Object.entries(env))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
