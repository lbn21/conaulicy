import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Every page and file is prerendered whole (CLAUDE.md, Caching): read from
// the sources, so a new route is held to the same rules before its build.
// - The root layout: dynamic = "error", so the build fails on anything
//   that reads a request.
// - Every route under a dynamic segment ([id], [zoneId], [scenario]):
//   generateStaticParams and dynamicParams = false, so an unknown value is
//   the prerendered 404, never a render.
// - Every content route handler: dynamic = "error"; no Cache-Control of
//   its own (Vercel's ISR headers apply); only the API routes (the crons,
//   /api/revalidate) are functions, and set no-store.
// - No Cache Components API anywhere: no "use cache", cacheLife,
//   cacheTag, io(), connection(), navigation(), searchParams.
// The CI build's route table checks the outcome (scripts/check-routes-table.mjs).

const WEB = join(import.meta.dirname, "..");
const APP = join(WEB, "app");

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(WEB, path);
const ROUTES = files(APP, (name) => /^(page|route)\.tsx?$/.test(name));
const API = /^app\/api\//;

test("the root layout fails the build on anything read per request", () => {
  assert.match(
    read(join(APP, "layout.tsx")),
    /^export const dynamic = "error";$/m,
  );
});

test("every route under a dynamic segment: its params listed, no other", () => {
  const dynamic = ROUTES.filter((path) => /\[[^\]]+\]/.test(rel(path)));
  assert.ok(dynamic.length >= 8, String(dynamic.length));
  for (const path of dynamic) {
    const code = read(path);
    assert.match(code, /^export const dynamicParams = false;$/m, rel(path));
    assert.match(code, /generateStaticParams/, rel(path));
  }
});

test("every content route handler: static, no Cache-Control of its own", () => {
  const handlers = ROUTES.filter(
    (path) => /route\.ts$/.test(path) && !API.test(rel(path)),
  );
  assert.ok(handlers.length >= 4, String(handlers.length));
  for (const path of handlers) {
    const code = read(path);
    assert.match(code, /^export const dynamic = "error";$/m, rel(path));
    assert.doesNotMatch(
      code,
      /Cache-Control|s-maxage|NO_STORE|Vercel-Cache-Tag/i,
      rel(path),
    );
  }
  // The metadata routes, the same rule.
  for (const name of ["robots.ts", "sitemap.ts", "manifest.ts"])
    assert.match(read(join(APP, name)), /^export const dynamic = "error";$/m);
  // The calendars' one response: its type and disposition only.
  assert.doesNotMatch(read(join(WEB, "lib/ics.ts")), /Cache-Control/i);
});

test("only the crons and /api/revalidate are functions", () => {
  assert.deepEqual(
    ROUTES.filter((path) => API.test(rel(path)))
      .map(rel)
      .sort(),
    [
      "app/api/cron/import/route.ts",
      "app/api/cron/keepwarm/route.ts",
      "app/api/cron/zuk/route.ts",
      "app/api/revalidate/route.ts",
    ],
  );
});

test("no Cache Components API and no per-request read anywhere in the site", () => {
  const code = ["app", "components", "lib"].flatMap((dir) =>
    files(
      join(WEB, dir),
      (name) => /\.tsx?$/.test(name) && !/\.test\./.test(name),
    ),
  );
  for (const path of code) {
    // The code alone: comments may name what is gone.
    const text = read(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      /["']use cache/,
      /\bcacheLife\(/,
      /\bcacheTag\(/,
      /\bio\(\)/,
      /\bconnection\(\)/,
      /\bnavigation\(\)/,
      /useSearchParams|\bsearchParams\s*[,}]|await searchParams/,
      /\bunstable_noStore\b/,
    ])
      assert.doesNotMatch(text, banned, `${rel(path)}: ${banned}`);
  }
});
