// Review pull requests (docs/import.md, "Review pull requests"): when a file
// needs a person (vision passes that disagree, streets that differ from the
// database), the import opens one PR per source file instead of an issue.
// The PR's diff is a reviewed-data file, etl/review/<source>/<stem>.yaml,
// pre-filled by the domain: merging it approves it (the next run uses it for
// that exact sha256), closing it rejects it. The original file is shown
// inline from its own branch, import-review-image/<source>/<stem>, which no
// PR contains, so a merge never brings it into main. The bot force-updates
// only these two branches. REVIEWS_FILE replaces GitHub in tests;
// IMPORT_REVIEW_DIR replaces etl/review (where merged files are read).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ROOT, type Source } from "./config.ts";
import type { Found } from "./domain.ts";

type Pr = {
  number: number;
  state: "open" | "closed" | "merged";
  sha256: string | null;
  url: string;
};
type Stored = Pr & {
  branch: string;
  title: string;
  body: string;
  files: Record<string, string>;
};

/** source/stem: one review per source file, whatever its version. */
export const reviewKey = (sourceId: string, fileName: string) =>
  `${sourceId}/${fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]/g, "-")}`;
const reviewedFile = (key: string) => `etl/review/${key}.yaml`;
const marker = (key: string, digest: string) =>
  `<!-- import-review: ${key} sha256:${digest} -->`;
const shaOf = (body: string) =>
  /<!-- import-review: \S+ sha256:([0-9a-f]+) -->/.exec(body)?.[1] ?? null;

/**
 * The merged reviewed-data file for this source file, if it is for this
 * exact sha256; a file reviewed for another version is ignored.
 */
export function readReviewed(
  sourceId: string,
  fileName: string,
  digest: string,
): Record<string, unknown> | null {
  const key = reviewKey(sourceId, fileName);
  const dir = process.env.IMPORT_REVIEW_DIR || path.join(ROOT, "etl/review");
  const file = path.join(dir, `${key}.yaml`);
  if (!existsSync(file)) return null;
  const value = parseYaml(readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  if (value?.sha256 === digest) return value;
  console.log(
    `${fileName}: ${reviewedFile(key)} was reviewed for another version of the file (sha256 ${String(value?.sha256).slice(0, 12)}…); ignored, the file needs a new review.`,
  );
  return null;
}

// The bot's commits; fixed dates, so the same image is the same commit.
const BOT = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
};
const FIXED_DATE = {
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

export type ReviewRequest = {
  source: Source;
  file: Found;
  body: Buffer;
  digest: string;
  /** Short, Polish: the PR title after "[import] ". */
  title: string;
  /** Blocking: the dates wait for the review; else it only acknowledges. */
  blocking: boolean;
  /** The domain's part of the PR body (Polish markdown). */
  markdown: string;
  /** The reviewed-data file's content (YAML). */
  reviewed: string;
  runUrl: string;
};

export class Reviews {
  #file = process.env.REVIEWS_FILE;
  #gh = !this.#file && Boolean(process.env.GH_TOKEN);
  #repo = process.env.GITHUB_REPOSITORY ?? "";
  #held = new Map<string, { note: string; blocks: boolean }>();

  #load(): Stored[] {
    return this.#file && existsSync(this.#file)
      ? JSON.parse(readFileSync(this.#file, "utf8"))
      : [];
  }

  #save(all: Stored[]) {
    if (this.#file) writeFileSync(this.#file, JSON.stringify(all, null, 1));
  }

  #git(args: string[], input?: Buffer | string, env = {}) {
    return execFileSync("git", args, {
      encoding: "utf8",
      input,
      env: { ...process.env, ...BOT, ...env },
    }).trim();
  }

  #run(args: string[], input?: string) {
    return execFileSync("gh", args, { encoding: "utf8", input }).trim();
  }

  /** Every PR from this review's branch, newest first. */
  #prs(branch: string): Pr[] {
    if (this.#file)
      return this.#load()
        .filter((p) => p.branch === branch)
        .reverse();
    if (!this.#gh) return [];
    return (
      JSON.parse(
        this.#run([
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "all",
          "--limit",
          "50",
          "--json",
          "number,state,body,url",
        ]),
      ) as Array<{ number: number; state: string; body: string; url: string }>
    ).map((p) => ({
      number: p.number,
      state: p.state.toLowerCase() as Pr["state"],
      sha256: shaOf(p.body),
      url: p.url,
    }));
  }

  /** A commit with only `files` (path → content) on `parent`'s tree, if any. */
  #commit(
    files: Record<string, Buffer | string>,
    message: string,
    parent: string | null,
    env = {},
  ): string {
    const index = path.join(mkdtempSync(path.join(tmpdir(), "review-")), "i");
    const withIndex = { GIT_INDEX_FILE: index, ...env };
    if (parent) this.#git(["read-tree", parent], undefined, withIndex);
    for (const [file, content] of Object.entries(files)) {
      const blob = this.#git(["hash-object", "-w", "--stdin"], content);
      this.#git(
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${file}`],
        undefined,
        withIndex,
      );
    }
    const tree = this.#git(["write-tree"], undefined, withIndex);
    return this.#git(
      ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
      undefined,
      withIndex,
    );
  }

  #push(commit: string, branch: string) {
    this.#git(["push", "--force", "origin", `${commit}:refs/heads/${branch}`]);
  }

  /**
   * What happened to this exact file's review: open (waiting), rejected
   * (closed without merging), merged, or null (no review yet).
   */
  status(sourceId: string, fileName: string, digest: string) {
    const prs = this.#prs(`import-review/${reviewKey(sourceId, fileName)}`);
    const same = prs.filter((p) => p.sha256 === digest);
    return {
      open: prs.find((p) => p.state === "open") ?? null,
      sameOpen: same.find((p) => p.state === "open") ?? null,
      rejected: same.find((p) => p.state === "closed") ?? null,
      merged: same.find((p) => p.state === "merged") ?? null,
    };
  }

  /**
   * Opens the review PR, or updates the open one: its body always, its
   * branches only for a new version of the file (a person's edits to the
   * reviewed-data file are kept). Returns its link.
   */
  open(req: ReviewRequest): string {
    const key = reviewKey(req.source.id, req.file.name);
    const branch = `import-review/${key}`;
    const imagePath = `etl/review/${key}/${req.file.name}`;
    const { open: current } = this.status(
      req.source.id,
      req.file.name,
      req.digest,
    );
    const keep = current?.sha256 === req.digest;
    const title = `[import] ${req.title}`;

    let imageUrl = `https://github.com/${this.#repo || "OWNER/REPO"}/raw/test/${imagePath}`;
    if (this.#gh) {
      // Its own branch, never in a PR: a merge cannot bring it into main.
      const image = this.#commit(
        // Vercel reads this commit's web/vercel.json: no deployment for it.
        {
          [imagePath]: req.body,
          "web/vercel.json": '{ "git": { "deploymentEnabled": false } }\n',
        },
        `Review image: ${req.file.name} (sha256 ${req.digest})`,
        null,
        FIXED_DATE,
      );
      this.#push(image, `import-review-image/${key}`);
      // github.com/<repo>/raw/<commit>/… renders for anyone signed in with
      // access to the private repository (raw.githubusercontent.com does not).
      imageUrl = `https://github.com/${this.#repo}/raw/${image}/${imagePath}`;
    }
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(req.file.name);
    const body = [
      req.blocking
        ? `Cześć! Import nie jest pewny odczytu pliku **${req.file.name}** (${req.source.name}) i niczego z niego nie zastosował. Potrzebne jest Twoje spojrzenie.`
        : `Cześć! Daty z pliku **${req.file.name}** (${req.source.name}) się zgadzają i idą zwykłą drogą. Coś jednak warto sprawdzić:`,
      "",
      `- Plik na stronie źródła: ${req.file.url}`,
      `- Strona harmonogramu: ${req.source.page}`,
      `- SHA-256: \`${req.digest}\``,
      req.runUrl ? `- Przebieg importu: ${req.runUrl}` : "",
      "",
      req.markdown,
      "",
      "### Oryginał",
      "",
      isImage
        ? `[![${req.file.name}](${imageUrl})](${imageUrl})`
        : `[${req.file.name}](${imageUrl})`,
      "",
      "### Co dalej",
      "",
      ...(req.blocking
        ? [
            `- **Scal** (merge) = zatwierdzam. Następny import zastosuje daty z \`${reviewedFile(key)}\` z tego PR. Możesz je najpierw poprawić w zakładce „Files changed”. Dotyczy tylko pliku o tym SHA-256: gdy plik na stronie się zmieni, będzie nowy przegląd.`,
            "- **Zamknij** = odrzucam. Baza zostaje bez zmian.",
          ]
        : [
            "- **Scal** albo **zamknij**: jedno i drugie tylko potwierdza, że to przejrzane. Ulice i strefy biorą się wyłącznie z bazy; jeśli ulica naprawdę zmieniła strefę, popraw bazę, a jeśli to tylko inna pisownia, dodaj ją do `aliases` w `etl/sources.yaml`.",
          ]),
      "",
      "PR otworzył import (GITHUB_TOKEN), więc CI na nim nie rusza. To w porządku: plik sprawdza następny import.",
      "",
      marker(key, req.digest),
    ].join("\n");

    if (this.#file) {
      const all = this.#load();
      const stored = current && all.find((p) => p.number === current.number);
      const reviewed = { [reviewedFile(key)]: req.reviewed };
      if (stored) {
        Object.assign(stored, { title, body, sha256: req.digest });
        if (!keep) stored.files = reviewed;
        this.#save(all);
        return stored.url;
      }
      const number = all.length + 1;
      const url = `https://github.com/test/pull/${number}`;
      all.push({
        number,
        state: "open",
        sha256: req.digest,
        url,
        branch,
        title,
        body,
        files: reviewed,
      });
      this.#save(all);
      return url;
    }
    if (!this.#gh) {
      console.log(
        `\nREVIEW PR (not opened, no GH_TOKEN): ${title}\n${body}\n\n${reviewedFile(key)}:\n${req.reviewed}`,
      );
      return "(no GH_TOKEN)";
    }
    if (!keep)
      this.#push(
        this.#commit(
          { [reviewedFile(key)]: req.reviewed },
          `Review: ${req.file.name} (sha256 ${req.digest})`,
          this.#git(["rev-parse", "HEAD"]),
        ),
        branch,
      );
    if (current) {
      this.#run(
        [
          "pr",
          "edit",
          String(current.number),
          "--title",
          title,
          "--body-file",
          "-",
        ],
        body,
      );
      return current.url;
    }
    try {
      return this.#run(
        [
          "pr",
          "create",
          "--base",
          "main",
          "--head",
          branch,
          "--title",
          title,
          "--body-file",
          "-",
        ],
        body,
      );
    } catch (error) {
      throw new Error(
        `cannot open the review PR for ${req.file.name} (Settings → Actions → General: "Allow GitHub Actions to create and approve pull requests" must be on): ${(error as Error).message.slice(0, 300)}`,
      );
    }
  }

  /** Closes the open review of an older version of a file that now reads clean. */
  supersede(sourceId: string, fileName: string, digest: string, note: string) {
    const { open } = this.status(sourceId, fileName, digest);
    if (!open || open.sha256 === digest) return;
    if (this.#file) {
      const all = this.#load();
      const stored = all.find((p) => p.number === open.number);
      if (stored) stored.state = "closed";
      this.#save(all);
    } else if (this.#gh)
      this.#run(["pr", "close", String(open.number), "--comment", note]);
    console.log(`Review PR closed (superseded): ${open.url}`);
  }

  /** The file is not applied this run (a review is pending or rejected). */
  hold(digest: string, note: string, blocks: boolean) {
    this.#held.set(digest, { note, blocks });
  }

  held(digest: string) {
    return this.#held.get(digest) ?? null;
  }
}
