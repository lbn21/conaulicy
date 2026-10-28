// Review pull requests (docs/import.md, "Review pull requests"): when a file
// needs a person (e.g. every new waste schedule), its domain opens one PR
// per source file instead of an issue.
// The PR's diff is a reviewed-data file, etl/review/<source>/<stem>.yaml,
// pre-filled by the domain: merging it approves it (the next run uses it for
// that exact sha256), closing it rejects it. The original image is shown
// inline from its public URL on the source site (GitHub's camo proxy renders
// it on web and mobile); no source file is ever pushed to git. The bot
// force-updates only import-review/* branches. REVIEWS_FILE replaces GitHub
// in tests; IMPORT_REVIEW_DIR replaces etl/review (where merged files are read).
// The PR's marker records the prompt's sha256, the model and the reasoning
// effort it was read with, so a rejected review blocks a second read only of
// that same reading.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Source } from "./config.ts";
import type { Found } from "./domain.ts";
import { loadList, saveList } from "./file-list.ts";
import { sha256 } from "./hash.ts";
import type { Http } from "./http.ts";
import { ROOT } from "./paths.ts";

type Pr = {
  number: number;
  state: "open" | "closed" | "merged";
  sha256: string | null;
  /** What it was read with (its marker); null where the marker has no such field. */
  prompt: string | null;
  model: string | null;
  effort: string | null;
  url: string;
};
type Stored = Omit<Pr, "prompt" | "model" | "effort"> & {
  branch: string;
  title: string;
  body: string;
  files: Record<string, string>;
};

/** source/stem: one review per source file, whatever its version. */
const reviewKey = (sourceId: string, fileName: string) =>
  `${sourceId}/${fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]/g, "-")}`;
const reviewedFile = (key: string) => `etl/review/${key}.yaml`;
/**
 * What a reading was asked of: the sha256 of the whole text sent (the
 * prompt, its place lists included), the model and the reasoning effort.
 */
export type ReadWith = { prompt: string; model: string; effort: string };
const marker = (key: string, digest: string, readWith?: ReadWith) =>
  `<!-- import-review: ${key} sha256:${digest}${readWith ? ` prompt:${readWith.prompt} model:${readWith.model} effort:${readWith.effort}` : ""} -->`;
/**
 * The marker's fields as written; a part it does not have is null (before
 * task 199 no prompt or model, before task 203 no effort).
 */
function markerOf(body: string) {
  const m =
    /<!-- import-review: \S+ sha256:([0-9a-f]+)(?: prompt:([0-9a-f]+) model:(\S+)(?: effort:(\S+))?)? -->/.exec(
      body,
    );
  return {
    sha256: m?.[1] ?? null,
    prompt: m?.[2] ?? null,
    model: m?.[3] ?? null,
    effort: m?.[4] ?? null,
  };
}

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

// The bot's commits.
const BOT = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
};

export type ReviewRequest = {
  source: Source;
  file: Found;
  digest: string;
  /** Short, Polish: the PR title after "[import] ". */
  title: string;
  /** Blocking: the dates wait for the review; else it only acknowledges. */
  blocking: boolean;
  /** The domain's part of the PR body (Polish markdown). */
  markdown: string;
  /** What the source's page is, in the body's link list (Polish). */
  pageLabel?: string;
  /** Appended to "merge or close: both acknowledge" when not blocking. */
  ackNote?: string;
  /** The reviewed-data file's content (YAML). */
  reviewed: string;
  /** What the reading was asked of: in the body and its marker. */
  readWith?: ReadWith;
  runUrl: string;
};

export class Reviews {
  #http: Http;
  #file = process.env.REVIEWS_FILE;
  #gh = !this.#file && Boolean(process.env.GH_TOKEN);
  #held = new Map<string, { note: string; blocks: boolean }>();

  constructor(http: Http) {
    this.#http = http;
  }

  #git(args: string[], input?: string, env = {}) {
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
      return loadList<Stored>(this.#file)
        .filter((p) => p.branch === branch)
        .map((p) => ({ ...p, ...markerOf(p.body), sha256: p.sha256 }))
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
      ...markerOf(p.body),
      url: p.url,
    }));
  }

  /** A commit with `files` (path → content) added to `parent`'s tree. */
  #commit(
    files: Record<string, string>,
    message: string,
    parent: string,
  ): string {
    const index = path.join(mkdtempSync(path.join(tmpdir(), "review-")), "i");
    const withIndex = { GIT_INDEX_FILE: index };
    this.#git(["read-tree", parent], undefined, withIndex);
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
      ["commit-tree", tree, "-p", parent, "-m", message],
      undefined,
      withIndex,
    );
  }

  #push(commit: string, branch: string) {
    this.#git(["push", "--force", "origin", `${commit}:refs/heads/${branch}`]);
  }

  /**
   * What happened to this exact file's review: open (waiting), rejected
   * (closed without merging), merged, or null (no review yet). Given
   * `readWith`, rejected is only a review read with that same prompt, model
   * and effort; one read otherwise, or whose marker lacks any of them, is
   * rejectedOther. Open and merged reviews count whatever they were read with.
   */
  status(
    sourceId: string,
    fileName: string,
    digest: string,
    readWith?: ReadWith,
  ) {
    const prs = this.#prs(`import-review/${reviewKey(sourceId, fileName)}`);
    const same = prs.filter((p) => p.sha256 === digest);
    const closed = same.filter((p) => p.state === "closed");
    const sameReading = (p: Pr) =>
      !readWith ||
      (p.prompt === readWith.prompt &&
        p.model === readWith.model &&
        p.effort === readWith.effort);
    return {
      open: prs.find((p) => p.state === "open") ?? null,
      sameOpen: same.find((p) => p.state === "open") ?? null,
      rejected: closed.find(sameReading) ?? null,
      rejectedOther: closed.find((p) => !sameReading(p)) ?? null,
      merged: same.find((p) => p.state === "merged") ?? null,
    };
  }

  /**
   * Opens the review PR, or updates the open one: its body always, its
   * branches only for a new version of the file (a person's edits to the
   * reviewed-data file are kept). Returns its link.
   */
  async open(req: ReviewRequest): Promise<string> {
    const key = reviewKey(req.source.id, req.file.name);
    const branch = `import-review/${key}`;
    const { open: current } = this.status(
      req.source.id,
      req.file.name,
      req.digest,
    );
    const keep = current?.sha256 === req.digest;
    const title = `[import] ${req.title}`;

    // The image shown is whatever the URL serves now: say so when that is
    // not the reviewed version (the SHA-256 stays the authority).
    const live = await this.#http
      .get(req.file.url)
      .then(async (r) => sha256(Buffer.from(await r.arrayBuffer())))
      .catch(() => null);
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(req.file.name);
    const body = [
      req.blocking
        ? `Cześć! Import odczytał plik **${req.file.name}** (${req.source.name}) i niczego z niego nie zastosował. Potrzebne jest Twoje spojrzenie.`
        : `Cześć! Daty z pliku **${req.file.name}** (${req.source.name}) się zgadzają i idą zwykłą drogą. Coś jednak warto sprawdzić:`,
      "",
      `- Plik na stronie źródła: ${req.file.url}`,
      `- ${req.pageLabel ?? "Strona źródła"}: ${req.source.page}`,
      `- SHA-256: \`${req.digest}\``,
      req.readWith
        ? `- Odczyt: model \`${req.readWith.model}\`, reasoning \`${req.readWith.effort}\`, SHA-256 promptu \`${req.readWith.prompt}\``
        : "",
      req.runUrl ? `- Przebieg importu: ${req.runUrl}` : "",
      "",
      req.markdown,
      "",
      "### Oryginał",
      "",
      isImage
        ? `[![${req.file.name}](${req.file.url})](${req.file.url})`
        : `[${req.file.name}](${req.file.url})`,
      ...(live === req.digest
        ? []
        : [
            "",
            `_Uwaga: plik pod tym adresem ${live ? "ma teraz inny SHA-256" : "nie dał się teraz pobrać"}, więc obraz może się różnić od przeglądanej wersji. Liczy się SHA-256 powyżej._`,
          ]),
      "",
      "### Co dalej",
      "",
      ...(req.blocking
        ? [
            `- **Scal** (merge) = zatwierdzam. Następny import zastosuje daty z \`${reviewedFile(key)}\` z tego PR. Możesz je najpierw poprawić w zakładce „Files changed”. Dotyczy tylko pliku o tym SHA-256: gdy plik na stronie się zmieni, będzie nowy przegląd.`,
            "- **Zamknij** = odrzucam. Baza zostaje bez zmian.",
          ]
        : [
            `- **Scal** albo **zamknij**: jedno i drugie tylko potwierdza, że to przejrzane.${req.ackNote ? ` ${req.ackNote}` : ""}`,
          ]),
      "",
      "PR otworzył import (GITHUB_TOKEN), więc CI na nim nie rusza. To w porządku: plik sprawdza następny import.",
      "",
      marker(key, req.digest, req.readWith),
    ].join("\n");

    if (this.#file) {
      const all = loadList<Stored>(this.#file);
      const stored = current && all.find((p) => p.number === current.number);
      const reviewed = { [reviewedFile(key)]: req.reviewed };
      if (stored) {
        Object.assign(stored, { title, body, sha256: req.digest });
        if (!keep) stored.files = reviewed;
        saveList(this.#file, all);
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
      saveList(this.#file, all);
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
      const all = loadList<Stored>(this.#file);
      const stored = all.find((p) => p.number === open.number);
      if (stored) stored.state = "closed";
      saveList(this.#file, all);
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
