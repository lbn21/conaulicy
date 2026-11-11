import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The site needs JavaScript: no page may say
// it, or its search, works without it, and /dostepnosc says it needs it.

const APP = join(import.meta.dirname, "..", "app");

/** Every page's source under app/. */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** JSX text on one line, as a reader sees it. */
const text = (path: string) => readFileSync(path, "utf8").replace(/\s+/g, " ");

test("no page claims the site works without JavaScript", () => {
  const claims = pages(APP).filter((path) =>
    /bez (JavaScript|JS)/i.test(text(path)),
  );
  assert.deepEqual(claims, []);
});

test("/dostepnosc says the site needs JavaScript", () => {
  assert.match(
    text(join(APP, "dostepnosc", "page.tsx")),
    /Strona potrzebuje JavaScriptu\./,
  );
});
