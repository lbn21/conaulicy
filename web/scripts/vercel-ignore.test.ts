import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

// The Vercel ignore step (scripts/vercel-ignore.sh) on a throwaway repo:
// exit 0 skips the build, exit 1 builds.
const script = join(import.meta.dirname, "vercel-ignore.sh");
const repo = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
after(() => rmSync(repo, { recursive: true, force: true }));

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
git("init", "-q");
git("config", "user.email", "test@example.invalid");
git("config", "user.name", "test");

function commit(files: string[]): string {
  for (const file of files) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), `${Math.random()}\n`);
  }
  git("add", "-A");
  git("commit", "-q", "-m", files.join(" "));
  return git("rev-parse", "HEAD");
}

function ignore(env: Record<string, string> = {}): number | null {
  const { VERCEL_GIT_PREVIOUS_SHA: _, VERCEL_ENV: __, ...rest } = process.env;
  return spawnSync("bash", [script], {
    cwd: join(repo, "web"),
    env: { ...rest, ...env },
  }).status;
}

const SKIP = 0;
const BUILD = 1;
commit(["web/app/page.tsx", "docs/a.md"]);

test("no previous deployed commit: build", () => {
  assert.equal(ignore(), BUILD);
  commit(["docs/b.md"]);
  assert.equal(ignore(), BUILD, "never HEAD^, even after a docs-only commit");
});

test("docs only: skip", () => {
  const base = git("rev-parse", "HEAD");
  commit(["docs/layout.md", "docs/perf/run.json", "CLAUDE.md"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), SKIP);
});

test("tests only: skip", () => {
  const base = git("rev-parse", "HEAD");
  commit(["web/lib/hub.test.ts", "web/components/__tests__/x.tsx"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), SKIP);
});

test("docs and code: build", () => {
  const base = git("rev-parse", "HEAD");
  commit(["docs/layout.md", "web/app/page.tsx"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), BUILD);
});

test("vercel.json: build", () => {
  const base = git("rev-parse", "HEAD");
  commit(["web/vercel.json"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), BUILD);
});

test("the whole range since the previous deploy counts, not only HEAD", () => {
  const base = git("rev-parse", "HEAD");
  commit(["web/lib/places.ts"]);
  commit(["docs/layout.md"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), BUILD);
});

test("a previous deployed commit not in the clone: build", () => {
  commit(["docs/c.md"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40) }), BUILD);
});

test("nothing changed: build", () => {
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: "HEAD" }), BUILD);
});

test("production: always a build, docs only or the same commit (a deploy hook)", () => {
  const base = git("rev-parse", "HEAD");
  commit(["docs/layout.md"]);
  assert.equal(ignore({ VERCEL_GIT_PREVIOUS_SHA: base }), SKIP);
  assert.equal(
    ignore({ VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_ENV: "production" }),
    BUILD,
  );
  const head = git("rev-parse", "HEAD");
  assert.equal(
    ignore({ VERCEL_GIT_PREVIOUS_SHA: head, VERCEL_ENV: "production" }),
    BUILD,
  );
  assert.equal(
    ignore({ VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_ENV: "preview" }),
    SKIP,
  );
});
