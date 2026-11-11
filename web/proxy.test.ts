// proxy.ts on its own, with /api/places and /404 stubbed: the status the
// proxy itself answers. The routes smoke (scripts/routes/query.mjs) checks
// the status a local `next start` sends, but a local server turns a rewrite
// to /404 into a 404 while Vercel serves it with the stored /404 result's
// 200 (t293). So the 404 must be the proxy's own Response, never a rewrite.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { type NextFetchEvent, NextRequest } from "next/server";
import { proxy } from "./proxy.ts";

const ORIGIN = "http://localhost:3000";
const KNOWN = "0972447-00470";
const PAGE = "<!DOCTYPE html><title>Nie znaleziono strony</title>";

const event = { waitUntil() {} } as unknown as NextFetchEvent;
const realFetch = globalThis.fetch;
let notFoundStatus = 404;
let fetched: string[] = [];

beforeEach(() => {
  fetched = [];
  globalThis.fetch = async (input) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input);
    fetched.push(pathname);
    if (pathname === "/api/places")
      return Response.json({ ids: [KNOWN], moved: { "0972447-00001": KNOWN } });
    if (pathname === "/404")
      return new Response(PAGE, {
        status: notFoundStatus,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    throw new Error(`unexpected fetch ${pathname}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function call(path: string, method = "GET") {
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method }), event);
}

test("proxy: the 404 page fails first, before it is cached: a rewrite, tried again", async () => {
  notFoundStatus = 500;
  const res = await call("/adres/0972447-99999");
  assert.ok(res.headers.get("x-middleware-rewrite")?.endsWith("/404"));
  notFoundStatus = 404;
});

for (const path of [
  "/adres/0972447-99999",
  "/adres/0972447-99999/smieci?nr=12",
  `/adres/${KNOWN}/pogoda`,
  `/adres/${KNOWN}/nie-ma-takiego-modulu`,
  "/adres/%E0%A4%A",
]) {
  test(`proxy: ${path} is the 404 page with its own 404, not a rewrite`, async () => {
    const res = await call(path);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await res.text(), PAGE);
  });
}

test("proxy: HEAD of an unknown address is a 404 without a body", async () => {
  const res = await call("/adres/0972447-99999", "HEAD");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "");
});

test("proxy: the 404 page is fetched once per instance", async () => {
  await call("/adres/0972447-99998");
  await call("/adres/0972447-99997");
  assert.ok(!fetched.includes("/404"));
});

for (const path of [
  `/adres/${KNOWN}`,
  `/adres/${KNOWN}?nr=12`,
  `/adres/${KNOWN}/smieci`,
  `/adres/${KNOWN}/harmonogram.pdf`,
  "/",
  "/ulice",
]) {
  test(`proxy: ${path} goes on to its route, nothing fetched`, async () => {
    const res = await call(path);
    assert.equal(res.headers.get("x-middleware-next"), "1");
    assert.equal(res.status, 200);
    assert.deepEqual(fetched, []);
  });
}

test("proxy: a renamed place's old id is a 308 to the new one", async () => {
  const res = await call("/adres/0972447-00001/smieci?nr=12");
  assert.equal(res.status, 308);
  assert.equal(
    res.headers.get("location"),
    `${ORIGIN}/adres/${KNOWN}/smieci?nr=12`,
  );
});
