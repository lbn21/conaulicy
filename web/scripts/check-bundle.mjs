// Fails when any route's first-load JS is over budget (gzip, 1 KB = 1000 bytes).
// Reads Next's own route list, which leaves out the noModule polyfill that
// modern browsers never download. Run after `next build`.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 150_000;

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

if (failed) {
  console.error(`First-load JS is over the ${BUDGET / 1000} KB budget.`);
  process.exit(1);
}
