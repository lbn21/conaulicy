// The build's route table (the log of `next build`, given as the first
// argument; CI tees it to a file): every page and route handler is
// prerendered, ○ (static) or ● (SSG, generateStaticParams), so only what
// the build made exists and nothing renders on request. Fails on any ƒ
// (dynamic) or ◐ (partial prerender) row but the API routes that must
// run (the crons, /api/revalidate), and on a Proxy (middleware) row.
// t416; docs/layout.md, „Static pages”.
import { readFileSync } from "node:fs";
import { finish } from "./lib/server.mjs";

const ALLOWED = new Set([
  "/api/cron/zuk",
  "/api/cron/import",
  "/api/cron/keepwarm",
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
// A route: a top-level row, its symbol before its path ("├ ƒ /api/cron/zuk")
// or, for a dynamic route, none ("├   /adres/[id]"), its prerendered paths
// on the rows under it ("│ ├ ● /adres/0972447-00470", "│ └ ● [+21 more
// paths]"). A route's kinds: its own symbol and its paths'. The legend's
// „ƒ  (Dynamic)” is no route: a path starts with "/".
const routes = [];
for (const line of log.slice(Math.max(start, 0)).split("\n")) {
  const top = /^[┌├└]\s+(?:([○●ƒ◐])\s+)?(\/\S*)/u.exec(line);
  const sub =
    /^│\s+[├└]\s+([○●ƒ◐])\s+(?:\[\+(\d+) more paths?\]|(\/\S*))/u.exec(line);
  if (top)
    routes.push({
      path: top[2],
      kinds: new Set(top[1] ? [top[1]] : []),
      paths: 0,
      lines: [line.trim()],
    });
  else if (sub && routes.length > 0) {
    const route = routes.at(-1);
    route.kinds.add(sub[1]);
    route.paths += sub[2] ? Number(sub[2]) : 1;
    if (sub[1] === "ƒ" || sub[1] === "◐") route.lines.push(line.trim());
  }
  if (/\bProxy\b|\bMiddleware\b/.test(line) && /ƒ/.test(line))
    failures.push(`a proxy (middleware): ${line.trim()}`);
}
if (start >= 0 && routes.length === 0) failures.push(`${file}: no route rows`);
const onRequest = (route) => route.kinds.has("ƒ") || route.kinds.has("◐");
const dynamic = routes.filter(onRequest);
for (const route of dynamic)
  if (!ALLOWED.has(route.path))
    failures.push(`rendered on request: ${route.lines.join(" / ")}`);
for (const path of ALLOWED)
  if (!routes.some((r) => r.path === path))
    failures.push(`${path}: not in the route table`);
for (const route of routes)
  if (route.kinds.size === 0)
    failures.push(`${route.path}: no prerendered path and no symbol`);
const files = routes.reduce((n, r) => n + Math.max(r.paths, 1), 0);
console.log(
  routes
    .map(
      (r) =>
        `${[...r.kinds].join("") || "?"} ${r.path}${r.paths ? ` (${r.paths} paths)` : ""}`,
    )
    .join("\n"),
);
finish(
  failures,
  `Route table: ${routes.length} routes, ${routes.length - dynamic.length} prerendered (${files} pages and files); ƒ only ${[...ALLOWED].join(", ")}.`,
);
