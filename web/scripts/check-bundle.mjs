// Fails when any route's first-load JS is over budget (gzip, 1 KB = 1000 bytes).
// Reads Next's own route list, which leaves out the noModule polyfill that
// modern browsers never download. Also fails if the address register's
// house numbers (lib/prg-numbers.generated.ts, server-only) are in any
// browser chunk. Run after `next build`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Sized for GOV.UK Frontend's JS and accessible-autocomplete, used as-is
// (docs/perf.md); the user-felt metrics are checked by check-perf.mjs.
const BUDGET = 200_000;

const routes = JSON.parse(
  readFileSync(".next/diagnostics/route-bundle-stats.json", "utf8"),
);

let failed = false;
for (const { route, firstLoadChunkPaths } of routes) {
  const bytes = firstLoadChunkPaths.reduce(
    (sum, path) => sum + gzipSync(readFileSync(path), { level: 9 }).length,
    0,
  );
  const over = bytes > BUDGET;
  failed ||= over;
  console.log(
    `${over ? "FAIL" : "ok  "} ${(bytes / 1000).toFixed(1)} KB  ${route}`,
  );
}

// A line of the numbers as it would sit in a chunk: id, then its list.
const line = /^(\d{7}(?:-\d{5})?;[^\n]+)$/m.exec(
  readFileSync("lib/prg-numbers.generated.ts", "utf8"),
)?.[1];
if (!line) throw new Error("lib/prg-numbers.generated.ts: no numbers");
const chunks = readdirSync(".next/static", {
  recursive: true,
  encoding: "utf8",
})
  .filter((file) => file.endsWith(".js"))
  .filter((file) =>
    readFileSync(path.join(".next/static", file), "utf8").includes(line),
  );
for (const file of chunks) console.error(`FAIL PRG numbers in ${file}`);
failed ||= chunks.length > 0;
if (!chunks.length) console.log("ok   PRG numbers in no browser chunk");

if (failed) {
  console.error(`First-load JS is over the ${BUDGET / 1000} KB budget.`);
  process.exit(1);
}
