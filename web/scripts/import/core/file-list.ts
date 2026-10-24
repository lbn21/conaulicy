// A list kept in a JSON file: GitHub's stand-in in tests (ISSUES_FILE,
// REVIEWS_FILE). Without a file it is empty and nothing is saved.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function loadList<T>(file: string | undefined): T[] {
  return file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
}

export function saveList<T>(file: string | undefined, all: T[]) {
  if (file) writeFileSync(file, JSON.stringify(all, null, 1));
}
