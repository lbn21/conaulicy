// The live data's freshness (t409): the pages hold the crons' data in their
// prerendered HTML, cached as "live" (next.config.ts), and the cron purges
// LIVE after each write (app/api/cron/zuk), so the request after a cron run
// shows what it wrote. On the built site (`next start`), the real cron
// route, its store a directory (LIVE_STORE_DIR, lib/live-store.ts), IMGW
// served by this script from the mock's own feeds (lib/imgw-mock.ts) on
// loopback, every other host refused (scripts/lib/no-network.mjs: the water
// sources fail, as when they are down; PGE is CI's mock). Twice: IMGW's
// feed with ours at level 2, a cron run, then the home page's „Teraz w
// gminie” must show a level-2 warning on the very next request; then level
// 3, the same. Run after `next build`.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockFetch } from "../lib/imgw-mock.ts";
import { finish, startServer } from "./lib/server.mjs";

const SECRET = "freshness-check";
const LEVELS = [2, 3];

let feed = "[]";
const imgw = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(feed);
});
await new Promise((resolve) => imgw.listen(0, "127.0.0.1", resolve));
const feedUrl = `http://127.0.0.1:${imgw.address().port}/imgw`;

const store = mkdtempSync(path.join(tmpdir(), "live-store-"));
const noNetwork = fileURLToPath(
  new URL("./lib/no-network.mjs", import.meta.url),
);
const server = await startServer(3308, {
  LIVE_STORE_DIR: store,
  CRON_SECRET: SECRET,
  IMGW_WARNINGS_URL: feedUrl,
  NODE_OPTIONS: `--import ${noNetwork}`,
  NEXT_TELEMETRY_DISABLED: "1",
});

/** The level of „Teraz w gminie”'s warning tag on the home page, or null. */
async function panelLevel() {
  const html = await (await fetch(`${server.origin}/`)).text();
  const panel = /<section aria-labelledby="teraz"[\s\S]*?<\/section>/.exec(
    html,
  )?.[0];
  if (!panel) return "no panel";
  return Number(/app-now__tag app-warning--(\d)/.exec(panel)?.[1]) || null;
}

const failures = [];
const seen = [];
try {
  for (const level of LEVELS) {
    const mock = await mockFetch(`mock:1809?level=${level}`);
    feed = await mock.text();
    const cron = await fetch(`${server.origin}/api/cron/zuk`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const run = await cron.json().catch(() => null);
    if (!run?.imgw?.checked || !run.imgw.changed)
      failures.push(
        `level ${level}: the cron wrote no IMGW feed (${cron.status} ${JSON.stringify(run?.imgw)})`,
      );
    const shown = await panelLevel();
    seen.push(`level ${level}: ${shown}`);
    if (shown !== level)
      failures.push(
        `level ${level}: the next request's panel shows ${shown}, not ${level}`,
      );
  }
} catch (error) {
  failures.push(`${error.message}\n${server.log()}`);
} finally {
  await server.stop();
  imgw.close();
  rmSync(store, { recursive: true, force: true });
}

finish(
  failures,
  `Freshness: after each cron write, the next request shows it (${seen.join(", ")}).`,
);
