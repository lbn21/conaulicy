// Starts the production server (`next start`) for the checks and lists the
// routes they cover, and ends a check (finish). Run `next build` first.
import { spawn } from "node:child_process";

// One of each kind of page. Keep in sync with the CI fixture (scripts/ci-fixture.ts).
export const ROUTES = [
  { path: "/", name: "home" },
  { path: "/adres/0972447-00470", name: "city-street" },
  { path: "/adres/0606010", name: "village" },
  { path: "/adres/0606234-90008", name: "village-street" },
  { path: "/adres/0972447-23434", name: "street-without-schedule" },
  { path: "/adres/0972447-90009", name: "street-schedule-ended" },
  { path: "/adres/0972447-90004", name: "split-street" },
  { path: "/adres/0972447-90004?nr=7a", name: "split-street-number" },
  { path: "/adres/0972447-90004?nr=42", name: "split-street-unknown-number" },
  { path: "/adres/0972447-90004?nr=", name: "split-street-missing-number" },
  { path: "/adres/0972447-00470?nr=12", name: "city-street-number" },
  { path: "/adres/0972447-00470/smieci", name: "city-street-waste" },
  { path: "/adres/0606010/smieci", name: "village-waste" },
  { path: "/adres/0972447-90004/smieci", name: "split-street-waste" },
  {
    path: "/adres/0972447-90004/smieci?nr=7a",
    name: "split-street-number-waste",
  },
  // The water subpage: noindex, and without a ZUK file in CI (no cut to show).
  { path: "/adres/0972447-00470/woda", name: "city-street-water" },
  { path: "/adres/0606010/woda", name: "village-water" },
  { path: "/ulice", name: "all-places" },
  { path: "/prywatnosc", name: "privacy" },
  { path: "/dostepnosc", name: "accessibility" },
  { path: "/o-projekcie", name: "about" },
  { path: "/szukaj?q=adama", name: "search-results" },
  { path: "/szukaj?q=xyzqq", name: "search-none" },
  { path: "/szukaj?q=", name: "search-empty" },
  { path: "/nie-ma-takiej-strony", name: "not-found", status: 404 },
  { path: "/adres/9999999", name: "unknown-place", status: 404 },
  {
    path: "/adres/0972447-00470/nie-ma-takiego-modulu",
    name: "unknown-module",
    status: 404,
  },
];

// The checks' user agents. A phone's Chrome, as Lighthouse emulates it: a
// browser, which Next.js may stream a page's metadata to (in <body>). And
// one of Next.js's default HTML-limited bots, which gets it in <head>
// (nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots).
export const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36";
export const BOT_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export async function startServer(port = 3300, extraEnv = {}) {
  // The pre-launch gate must be off, or every page is a 401. Empty, not
  // unset: Next's .env loading never overrides a set variable, so a local
  // .env.local cannot turn it back on.
  const env = {
    ...process.env,
    PORT: String(port),
    SITE_BASIC_AUTH: "",
    ...extraEnv,
  };
  // Its own process group, so stop() also ends the server npx started.
  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    return exited;
  };
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });

  const origin = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(origin);
      return { origin, stop, log: () => log };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await stop();
  throw new Error(`next start did not answer on ${origin}.\n${log}`);
}

// A check's ending: its FAIL lines and exit 1, or its summary and exit 0
// (the server's output pipes would otherwise keep Node alive).
export function finish(failures, summary) {
  if (failures.length > 0) {
    console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(summary);
  process.exit(0);
}

// A JSON response's body; anything but a 2xx fails the check with the URL
// and status, not a JSON parse error on an error page (QA review of #216).
export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GET ${url}: HTTP ${response.status} ${response.statusText}, expected JSON`,
    );
  }
  return response.json();
}

// The search field's index that a home page's HTML links
// (/api/search-index/<hash>): its URL, and its [id, label, type] rows, none
// when the page links no index.
export async function searchIndexOf(origin, home) {
  const url = /\/api\/search-index\/[\da-f]+/.exec(home)?.[0];
  const places = url ? await fetchJson(`${origin}${url}`) : [];
  return { url, places };
}
