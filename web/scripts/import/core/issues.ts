// GitHub issues for the unattended import: one open issue per problem key
// (a hidden marker in the body), never a duplicate, closed automatically by
// the first healthy run. ISSUES_FILE replaces GitHub in tests.
import { execFileSync } from "node:child_process";
import { loadList, saveList } from "./file-list.ts";

type Stored = {
  number: number;
  key: string;
  title: string;
  body: string;
  state: "open" | "closed";
  comments: string[];
};

const marker = (key: string) => `<!-- import-key: ${key} -->`;
const keyOf = (body: string) =>
  /<!-- import-key: (\S+) -->/.exec(body)?.[1] ?? null;

export class Issues {
  #raised = new Set<string>();
  #file = process.env.ISSUES_FILE;
  #gh = !this.#file && Boolean(process.env.GH_TOKEN);
  #open: Array<{ number: number; key: string }> | null = null;

  #openIssues(): Array<{ number: number; key: string }> {
    if (this.#open) return this.#open;
    if (this.#file)
      this.#open = loadList<Stored>(this.#file)
        .filter((i) => i.state === "open")
        .map(({ number, key }) => ({ number, key }));
    else if (this.#gh) {
      const listed = JSON.parse(
        execFileSync(
          "gh",
          [
            "issue",
            "list",
            "--state",
            "open",
            "--search",
            "[import] in:title",
            "--limit",
            "200",
            "--json",
            "number,body",
          ],
          { encoding: "utf8" },
        ),
      ) as Array<{ number: number; body: string }>;
      this.#open = listed.flatMap((i) => {
        const key = keyOf(i.body);
        return key ? [{ number: i.number, key }] : [];
      });
    } else this.#open = [];
    return this.#open;
  }

  /** Opens the issue for this key unless one is open already. */
  raise(key: string, title: string, body: string) {
    this.#raised.add(key);
    if (this.#openIssues().some((i) => i.key === key)) {
      console.log(`Issue already open: ${key}`);
      return;
    }
    const text = `${body}\n\n${marker(key)}`;
    if (this.#file) {
      const all = loadList<Stored>(this.#file);
      const number = all.length + 1;
      all.push({
        number,
        key,
        title: `[import] ${title}`,
        body: text,
        state: "open",
        comments: [],
      });
      saveList(this.#file, all);
      this.#open?.push({ number, key });
    } else if (this.#gh) {
      execFileSync(
        "gh",
        ["issue", "create", "--title", `[import] ${title}`, "--body", text],
        { stdio: "inherit" },
      );
    } else console.log(`\nISSUE (not opened, no GH_TOKEN): ${title}\n${body}`);
  }

  /** Closes open issues under a key prefix that this run did not raise again. */
  resolve(prefix: string, note: string) {
    for (const issue of this.#openIssues()) {
      if (!issue.key.startsWith(prefix) || this.#raised.has(issue.key))
        continue;
      if (this.#file) {
        const all = loadList<Stored>(this.#file);
        const stored = all.find((i) => i.number === issue.number);
        if (stored) {
          stored.state = "closed";
          stored.comments.push(note);
        }
        saveList(this.#file, all);
      } else if (this.#gh)
        execFileSync(
          "gh",
          ["issue", "close", String(issue.number), "--comment", note],
          { stdio: "inherit" },
        );
      console.log(`Issue closed: ${issue.key}`);
    }
    this.#open = this.#openIssues().filter(
      (i) => !i.key.startsWith(prefix) || this.#raised.has(i.key),
    );
  }
}
