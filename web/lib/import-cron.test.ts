import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISPATCH_URL,
  handleImportCron,
  type ImportCronDeps,
} from "./import-cron.ts";

const SECRET = "cron-secret";
const TOKEN = "dispatch-token-never-logged";

type World = {
  status: number;
  body: string;
  calls: Array<{ url: string; init: RequestInit }>;
  logs: Array<Record<string, unknown>>;
};

function world(over: Partial<World> = {}): World {
  return { status: 204, body: "", calls: [], logs: [], ...over };
}

function deps(w: World, over: Partial<ImportCronDeps> = {}): ImportCronDeps {
  return {
    fetch: (async (url: string, init: RequestInit) => {
      w.calls.push({ url, init });
      return new Response(w.status === 204 ? null : w.body, {
        status: w.status,
      });
    }) as typeof fetch,
    vercelEnv: "production",
    token: TOKEN,
    log: (line) => w.logs.push(line),
    ...over,
  };
}

const call = (
  w: World,
  auth: string | null = `Bearer ${SECRET}`,
  over: Partial<ImportCronDeps> = {},
  secret: string | undefined = SECRET,
) =>
  handleImportCron(
    new Request("https://conaulicy.pl/api/cron/import", {
      headers: auth ? { authorization: auth } : {},
    }),
    secret,
    deps(w, over),
  );

const noToken = (w: World) =>
  assert.doesNotMatch(JSON.stringify(w.logs), new RegExp(TOKEN));

test("auth: Vercel Cron's bearer secret, nothing else", async () => {
  const w = world();
  assert.equal((await call(w, null)).status, 401);
  assert.equal((await call(w, "Bearer wrong")).status, 401);
  assert.equal((await call(w, SECRET)).status, 401);
  // No CRON_SECRET set: nobody gets in.
  assert.equal((await call(w, "Bearer ", {}, "")).status, 401);
  assert.equal((await call(w, "Bearer undefined", {}, undefined)).status, 401);
  assert.equal(w.calls.length, 0);
});

test("not production: skipped, nothing dispatched", async () => {
  for (const vercelEnv of ["preview", "development", undefined]) {
    const w = world();
    const response = await call(w, undefined, { vercelEnv });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { skipped: "not production" });
    assert.equal(w.calls.length, 0);
  }
});

test("204: import.yml dispatched on main with mode=apply", async () => {
  const w = world();
  const response = await call(w);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(w.calls.length, 1);
  const [{ url, init }] = w.calls;
  assert.equal(
    url,
    "https://api.github.com/repos/lbn21/conaulicy/actions/workflows/import.yml/dispatches",
  );
  assert.equal(url, DISPATCH_URL);
  assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(String(init.body)), {
    ref: "main",
    inputs: { mode: "apply" },
  });
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(headers.Accept, "application/vnd.github+json");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
  noToken(w);
});

test("any other status: 502, status and body logged, never the token", async () => {
  for (const status of [200, 401, 404, 422, 500]) {
    const w = world({ status, body: `{"message":"no ${status}"}` });
    const response = await call(w);
    assert.equal(response.status, 502);
    assert.equal(w.calls.length, 1, "no retries");
    assert.deepEqual(w.logs, [
      {
        import: "dispatch-failed",
        status,
        body: `{"message":"no ${status}"}`,
      },
    ]);
    noToken(w);
    assert.doesNotMatch(await response.text(), new RegExp(TOKEN));
  }
});

test("no IMPORT_DISPATCH_TOKEN: 500, logged, nothing dispatched", async () => {
  for (const token of [undefined, ""]) {
    const w = world();
    const response = await call(w, undefined, { token });
    assert.equal(response.status, 500);
    assert.equal(w.calls.length, 0);
    assert.equal(w.logs.length, 1);
    assert.match(String(w.logs[0].error), /IMPORT_DISPATCH_TOKEN/);
  }
});
