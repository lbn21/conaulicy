import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fixtureDataset } from "./dataset-fixture.ts";
import { MADE_UP } from "./dataset-store.ts";
import { MissingDeployHook, syncAction, syncDataset } from "./dataset-sync.ts";
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

test("syncDataset: the same set revalidates; another calls the hook once, no revalidation", async () => {
  const calls: string[] = [];
  const deps = (hookUrl?: string) => ({
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(null, { status: 201 });
    }) as typeof fetch,
    hookUrl,
    revalidate: () => calls.push("revalidate"),
  });
  asBuild(placeSetOf(fixtureDataset(todayInWarsaw())));
  assert.deepEqual(await syncDataset(deps()), {
    version: MADE_UP,
    action: "revalidate",
  });
  assert.deepEqual(calls, ["revalidate"]);

  calls.length = 0;
  asBuild("another");
  assert.deepEqual(await syncDataset(deps("https://hook.example/x")), {
    version: MADE_UP,
    action: "deploy",
  });
  assert.deepEqual(calls, ["POST https://hook.example/x"]);
});

test("syncDataset: another set and no DEPLOY_HOOK_URL: an error, nothing revalidated", async () => {
  const calls: string[] = [];
  asBuild("another");
  await assert.rejects(
    syncDataset({
      fetch: (async () => new Response(null)) as typeof fetch,
      hookUrl: undefined,
      revalidate: () => calls.push("revalidate"),
    }),
    MissingDeployHook,
  );
  assert.equal(calls.length, 0);
  // A hook that fails: an error too.
  await assert.rejects(
    syncDataset({
      fetch: (async () => new Response(null, { status: 500 })) as typeof fetch,
      hookUrl: "https://hook.example/x",
      revalidate: () => calls.push("revalidate"),
    }),
    /HTTP 500/,
  );
});
