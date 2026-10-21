// The review PR's git and gh path (GitHub itself is replaced: a bare local
// remote and a fake gh that records its calls).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("a review PR: image on its own branch, reviewed file on main, gh create", () => {
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
  process.env.GITHUB_REPOSITORY = "o/r";
  delete process.env.REVIEWS_FILE;
  process.chdir(path.join(dir, "repo"));
  const origin = (args: string[]) => git(args, path.join(dir, "origin.git"));
  const reviews = new Reviews();
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
    body: Buffer.from("JPEG"),
    digest: "ab".repeat(32),
    title: "Sektor 5: odczyty się różnią",
    blocking: true,
    markdown: "| table |",
    reviewed: "sha256: ab\n",
    runUrl: "",
  };
  assert.equal(reviews.open(request), "https://github.com/o/r/pull/7");

  const image = origin([
    "rev-parse",
    "import-review-image/miasto/harmonogram-2026-s5",
  ]);
  assert.equal(
    origin(["ls-tree", "-r", "--name-only", image]),
    "etl/review/miasto/harmonogram-2026-s5/harmonogram-2026-s5.jpg\nweb/vercel.json",
  );
  assert.equal(origin(["rev-list", "--count", image]), "1");
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
      `https://github.com/o/r/raw/${image}/etl/review/miasto/harmonogram-2026-s5/harmonogram-2026-s5.jpg`,
    ),
  );
  assert.match(
    calls,
    /<!-- import-review: miasto\/harmonogram-2026-s5 sha256:(ab){32} -->/,
  );

  // The same image is the same commit, so a later run pushes nothing new.
  reviews.open(request);
  assert.equal(
    origin(["rev-parse", "import-review-image/miasto/harmonogram-2026-s5"]),
    image,
  );
});
