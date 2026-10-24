// Fails if data files are tracked in git. Raw sources live in the private S3
// bucket (docs/data/sources.md) and processed data is never committed. Under
// docs/data/ only the manifest, the inventory and notes may be tracked;
// anywhere else, PDF, JPEG, JSON, CSV, XML and HTML files must be on the allow-list
// (config, migration metadata, design and logo assets). Test fixtures are
// code (scripts/lib/import-fixture.ts, scripts/ci-fixture.ts).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { finish } from "./lib/server.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DOCS_DATA_ALLOWED = new Set([
  "docs/data/sources.md",
  "docs/data/DATA-INVENTORY.md",
  "docs/data/imgw.md",
]);
const DATA_EXTENSION = /\.(pdf|jpe?g|json|csv|xml|html?)$/i;
const ALLOWED = [
  /^web\/package(-lock)?\.json$/,
  /^web\/(tsconfig|biome|vercel|knip)\.json$/,
  /^web\/drizzle\/meta\/[^/]+\.json$/,
  /^\.cursor\/cli\.json$/,
  /^etl\/sources\.schema\.json$/,
  /^design\/proposals\/([^/]+\/)?index\.html$/,
  /^docs\/logo\/debug\/a-measure\.json$/,
];

const tracked = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const failures = tracked.filter((file) =>
  file.startsWith("docs/data/")
    ? !DOCS_DATA_ALLOWED.has(file)
    : DATA_EXTENSION.test(file) && !ALLOWED.some((rule) => rule.test(file)),
);

finish(
  failures.map(
    (f) =>
      `${f}: a data file in git (archive it in S3, see docs/data/sources.md)`,
  ),
  `Tracked data: none (${tracked.length} files checked; sources are in S3, docs/data/sources.md).`,
);
