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

// A page as the browser shows it once every live block is in: the page's
// static shell streams each block (IMGW, water, „Najbliższe dni”) after it,
// behind a skeleton (components/live-block.tsx), and „Dziś” renders in the
// browser (components/day-word.tsx), so the server's
// HTML alone has skeletons there. Chromium, JS on, reduced motion; the
// skeletons gone (or 10 s); void elements written as React writes them
// (<hr/>), React's own marks left out, so checks match either. Its status
// is the document's.
let pages;
export async function renderedPage(url, { width = 375, userAgent } = {}) {
  if (!pages) {
    const { chromium } = await import("playwright");
    pages = await chromium.launch();
  }
  const context = await pages.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
    ...(userAgent ? { userAgent } : {}),
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "networkidle" });
    await page
      .waitForFunction(() => !document.querySelector(".app-skeleton"), null, {
        timeout: 10_000,
      })
      .catch(() => {});
    const html = (await page.content())
      .replace(
        /<(hr|br|input|img|meta|link)(\s[^>]*?)?>/g,
        (_, tag, attrs = "") => `<${tag}${attrs}/>`,
      )
      // React's own marks, not the page's: its Suspense boundaries'
      // comments and the view transitions' hints it leaves on revealed
      // elements.
      .replace(/<!--[$/&!?]*-->/g, "")
      .replace(/ vt-[a-z]+="[^"]*"/g, "");
    return { status: response?.status() ?? 0, html, url: page.url() };
  } finally {
    await context.close();
  }
}

/** Closes renderedPage's browser, if it started one. */
export async function closeRenderedPages() {
  await pages?.close();
  pages = undefined;
}

/**
 * An unknown address (or module): a 404. The address routes serve a known
 * place's prerendered shell; an id never prerendered first gets the route's
 * fallback shell, its status sent before the page knows the place is
 * unknown (ensureStatic 'prefetch':
 * nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic),
 * so that one first answer may be a 200, but only with the 404 page and
 * noindex; every later one is the cached 404. Returns what failed, or null.
 */
export async function notFoundAt(url) {
  const first = await fetch(url);
  const html = await first.text();
  if (
    first.status !== 404 &&
    !(
      first.status === 200 &&
      html.includes('<meta name="robots" content="noindex"/>') &&
      html.includes("Nie ma takiej strony")
    )
  )
    return `${first.status}, want 404 (or a first 200 with the 404 page and noindex)`;
  // The 404 is generated in the background after the first answer.
  let status = first.status;
  for (let i = 0; i < 20 && status !== 404; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const again = await fetch(url);
    await again.arrayBuffer();
    status = again.status;
  }
  return status === 404 ? null : `${status} after the first answer, want 404`;
}

/**
 * The page's <main> and ids, as the browser has them (a Playwright page):
 * how many elements are #main-content and whether the first is a visible
 * <main>, and every id used more than once. One <main>, the root layout's
 * (app/layout.tsx): Next.js keeps a page left by a client-side navigation
 * in the document, hidden (Activity), so a page's own ids would repeat.
 */
export function mainAndIds(page) {
  return page.evaluate(() => {
    const mains = document.querySelectorAll("#main-content");
    const counts = new Map();
    for (const el of document.querySelectorAll("[id]")) {
      counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
    }
    return {
      mains: mains.length,
      main: mains[0]?.tagName === "MAIN" && mains[0].checkVisibility() === true,
      duplicates: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
    };
  });
}
