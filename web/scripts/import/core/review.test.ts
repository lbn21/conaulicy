// The review PR's git and gh path (GitHub itself is replaced: a bare local
// remote and a fake gh that records its calls).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Source } from "./config.ts";
import { Reviews } from "./review.ts";

const dir = mkdtempSync(path.join(tmpdir(), "review-test-"));
const git = (args: string[], cwd = path.join(dir, "repo")) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  }).trim();

// The source site: serves `served` at any URL, or fails when it is null.
let served: Buffer | null = Buffer.from("JPEG");
const http = {
  get: async (url: string) => {
    if (!served) throw new Error(`GET ${url}: HTTP 404`);
    return new Response(new Uint8Array(served));
  },
};
const digest = createHash("sha256").update("JPEG").digest("hex");

test("a review PR: the reviewed file on main, the image from its public URL, gh create", async () => {
  git(["init", "-q", "--bare", path.join(dir, "origin.git")], dir);
  git(["init", "-q", "-b", "main", path.join(dir, "repo")], dir);
  writeFileSync(path.join(dir, "repo/README"), "x");
  git(["add", "README"]);
  git(["commit", "-q", "-m", "main"]);
  git(["remote", "add", "origin", path.join(dir, "origin.git")]);
  const main = git(["rev-parse", "HEAD"]);

  // A fake gh: no PRs yet; logs every call with its stdin.
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const log = path.join(dir, "gh.log");
  writeFileSync(
    path.join(bin, "gh"),
    `#!/bin/sh\n{ echo "ARGS $*"; cat; } >> "${log}"\ncase "$2" in list) echo '[]';; create) echo https://github.com/o/r/pull/7;; esac\n`,
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.GH_TOKEN = "fake";
  delete process.env.REVIEWS_FILE;
  process.chdir(path.join(dir, "repo"));
  const origin = (args: string[]) => git(args, path.join(dir, "origin.git"));
  const reviews = new Reviews(http);
  const request = {
    source: {
      id: "miasto",
      name: "Miasto",
      page: "https://example.org/p/",
    } as Source,
    file: {
      name: "harmonogram-2026-s5.jpg",
      url: "https://example.org/s5.jpg",
      mediaId: 1,
      modified: null,
    },
    digest,
    title: "Sektor 5: odczyty się różnią",
    blocking: true,
    markdown: "| table |",
    reviewed: "sha256: ab\n",
    runUrl: "",
  };
  assert.equal(await reviews.open(request), "https://github.com/o/r/pull/7");

  // Only the review branch: no source file is pushed anywhere.
  assert.equal(
    origin(["for-each-ref", "--format=%(refname)", "refs/heads"]),
    "refs/heads/import-review/miasto/harmonogram-2026-s5",
  );
  const review = origin([
    "rev-parse",
    "import-review/miasto/harmonogram-2026-s5",
  ]);
  assert.equal(origin(["rev-parse", `${review}^`]), main);
  assert.equal(
    origin(["diff", "--name-only", main, review]),
    "etl/review/miasto/harmonogram-2026-s5.yaml",
  );
  const calls = readFileSync(log, "utf8");
  assert.match(
    calls,
    /ARGS pr create --base main --head import-review\/miasto\/harmonogram-2026-s5/,
  );
  assert.ok(
    calls.includes(
      "[![harmonogram-2026-s5.jpg](https://example.org/s5.jpg)](https://example.org/s5.jpg)",
    ),
  );
  assert.ok(!calls.includes("Uwaga:"), "a note for the reviewed version");
  assert.ok(
    calls.includes(
      `<!-- import-review: miasto/harmonogram-2026-s5 sha256:${digest} -->`,
    ),
  );
});

test("the live file is another version, or cannot be fetched: a note", async () => {
  process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
  const reviews = new Reviews(http);
  const request = {
    source: { id: "miasto", name: "Miasto", page: "" } as Source,
    file: {
      name: "s1.jpg",
      url: "https://example.org/s1.jpg",
      mediaId: 1,
      modified: null,
    },
    digest,
    title: "t",
    blocking: true,
    markdown: "",
    reviewed: "",
    runUrl: "",
  };
  const body = () =>
    JSON.parse(readFileSync(process.env.REVIEWS_FILE ?? "", "utf8"))[0].body;
  served = Buffer.from("JPEG v2");
  await reviews.open(request);
  assert.match(body(), /ma teraz inny SHA-256, więc obraz może się różnić/);
  served = null;
  await reviews.open(request);
  assert.match(body(), /nie dał się teraz pobrać, więc obraz może się różnić/);
});
