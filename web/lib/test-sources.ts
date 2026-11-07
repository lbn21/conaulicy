// The site's own code, for the tests that read it (lib/cache-tags.test.ts,
// lib/prg.test.ts, components/breadcrumbs.test.ts). Test-only.
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

/** A file's text, by its path from web/. */
export const source = (path: string) =>
  readFileSync(new URL(path, root), "utf8");

/** Every .ts and .tsx file under app/, components/ and lib/, no tests, sorted. */
export const SOURCES = ["app", "components", "lib"]
  .flatMap((dir) =>
    readdirSync(new URL(dir, root), { recursive: true, encoding: "utf8" }).map(
      (path) => `${dir}/${path}`,
    ),
  )
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path))
  .sort();

/** The source files whose text matches `pattern`. */
export const calling = (pattern: RegExp) =>
  SOURCES.filter((path) => pattern.test(source(path)));
