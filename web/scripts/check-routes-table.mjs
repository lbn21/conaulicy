// The build's route table (the log of `next build`, given as the first
// argument; CI tees it to a file): every page and route handler is
// prerendered, ○ (static) or ● (SSG, generateStaticParams), so only what
// the build made exists and nothing renders on request. Fails on any ƒ
// (dynamic) or ◐ (partial prerender) row but the three API routes that
// must run (the crons, /api/revalidate), and on a Proxy (middleware) row.
// t416; docs/layout.md, „Static pages”.
import { readFileSync } from "node:fs";
import { finish } from "./lib/server.mjs";

const ALLOWED = new Set([
  "/api/cron/zuk",
  "/api/cron/import",
  "/api/revalidate",
]);

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/check-routes-table.mjs <build.log>");
  process.exit(2);
}
// No colours: the log as the terminal would show it.
const ESC = String.fromCharCode(27);
const log = readFileSync(file, "utf8").replaceAll(
  new RegExp(`${ESC}\\[[0-9;]*m`, "g"),
  "",
);
const start = log.indexOf("Route (app)");
const failures = [];
if (start < 0) failures.push(`${file}: no route table ("Route (app)")`);
const rows = [];
for (const line of log.slice(Math.max(start, 0)).split("\n")) {
  // "├ ƒ /api/cron/zuk", "└ ● /adres/[id]", "ƒ Proxy (Middleware)".
  // The legend's „ƒ  (Dynamic)” is no route: a path starts with "/".
  const row = /^[┌├└│ ]*\s*([○●ƒ◐])\s+(\/\S*)/u.exec(line);
  if (row) rows.push({ kind: row[1], path: row[2], line: line.trim() });
  if (/\bProxy\b|\bMiddleware\b/.test(line) && /ƒ/.test(line))
    failures.push(`a proxy (middleware): ${line.trim()}`);
}
if (start >= 0 && rows.length === 0) failures.push(`${file}: no route rows`);
const dynamic = rows.filter((r) => r.kind === "ƒ" || r.kind === "◐");
for (const row of dynamic)
  if (!ALLOWED.has(row.path))
    failures.push(`rendered on request (${row.kind}): ${row.line}`);
for (const path of ALLOWED)
  if (!rows.some((r) => r.path === path))
    failures.push(`${path}: not in the route table`);
console.log(rows.map((r) => `${r.kind} ${r.path}`).join("\n"));
finish(
  failures,
  `Route table: ${rows.length} routes, ${rows.length - dynamic.length} prerendered; ƒ only ${[...ALLOWED].join(", ")}.`,
);
