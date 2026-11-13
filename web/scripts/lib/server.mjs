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
  { path: "/adres/0972447-00470/smieci", name: "city-street-waste" },
  { path: "/adres/0606010/smieci", name: "village-waste" },
  // The water subpage: noindex; in CI MZGKiM's fixture cut on the town
  // street (MZGKIM_MOCK, .github/workflows/ci.yml), none in the village.
  { path: "/adres/0972447-00470/woda", name: "city-street-water" },
  { path: "/adres/0606010/woda", name: "village-water" },
  // The power subpage: PGE's derived outages in CI (PGE_API_URL=mock:ours),
  // a failure on the town street, none in the village.
  { path: "/adres/0972447-00470/prad", name: "city-street-power" },
  { path: "/adres/0606010/prad", name: "village-power" },
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
  // No weather subpage any more: its warnings are cards on the
  // address page.
  { path: "/adres/0972447-00470/pogoda", name: "old-weather", status: 404 },
  // No power calendar: only the water has one (woda.ics).
  { path: "/adres/0972447-00470/prad.ics", name: "no-power-ics", status: 404 },
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
  const env = { ...process.env, PORT: String(port), ...extraEnv };
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
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GET ${url}: HTTP ${response.status} ${response.statusText}, expected JSON`,
    );
  }
  return response.json();
}

// The search field's index (/search-index.json, one fixed static path):
// its URL, and its [id, label, type] rows, none when the home page does
// not link it.
export async function searchIndexOf(origin, home) {
  const url = home.includes("/search-index.json") ? "/search-index.json" : null;
  const places = url ? await fetchJson(`${origin}${url}`) : [];
  return { url, places };
}

// A page as the browser shows it: Chromium, JS on, reduced motion; void
// elements written as React writes them (<hr/>), React's own marks left
// out, so checks match the served HTML either way. Its status is the
// document's.
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
    const html = withoutReactMarks(await page.content()).replace(
      /<(hr|br|input|img|meta|link)(\s[^>]*?)?>/g,
      (_, tag, attrs = "") => `<${tag}${attrs}/>`,
    );
    return { status: response?.status() ?? 0, html, url: page.url() };
  } finally {
    await context.close();
  }
}

/**
 * A page's HTML without React's own marks, which are not the page's: its
 * Suspense and Activity boundaries' comments (a parallel route's slot is
 * one) and the view transitions' hints it leaves on revealed elements.
 */
export function withoutReactMarks(html) {
  return html
    .replace(/<!--[$/&!?]*-->/g, "")
    .replace(/ vt-[a-z]+="[^"]*"/g, "");
}

/** Closes renderedPage's browser, if it started one. */
export async function closeRenderedPages() {
  await pages?.close();
  pages = undefined;
}

/**
 * An unknown address (or module): a 404 on its very first answer, the 404
 * page (noindex). The address routes stream their prerendered shell, a 200,
 * before the page knows the place, so proxy.ts answers these itself, before
 * any render (lib/address-routes.ts unknownAddress). Returns what failed, or
 * null.
 */
export async function notFoundAt(url) {
  const response = await fetch(url, { redirect: "manual" });
  const html = await response.text();
  if (response.status !== 404)
    return `${response.status} on the first answer, want 404`;
  if (
    !html.includes('<meta name="robots" content="noindex"/>') ||
    !html.includes("Nie znaleziono strony")
  )
    return "404 without the 404 page and noindex";
  return null;
}

/**
 * The page's <main> and ids, as the browser has them (a Playwright page):
 * how many visible <main> there are, how many elements are #main-content
 * (the skip link's target, components/skip-target.tsx) and whether the
 * first is visible, inside a <main> and focusable by script, and every
 * id used more than once. Next.js keeps a page left by a client-side
 * navigation in the document, hidden (Activity), so a page's own ids
 * would repeat.
 */
export function mainAndIds(page) {
  return page.evaluate(() => {
    const targets = document.querySelectorAll("#main-content");
    const target = targets[0];
    const counts = new Map();
    for (const el of document.querySelectorAll("[id]")) {
      counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
    }
    return {
      mains: [...document.querySelectorAll("main")].filter((el) =>
        el.checkVisibility(),
      ).length,
      targets: targets.length,
      target:
        target?.checkVisibility() === true &&
        target.tagName !== "MAIN" &&
        !!target.closest("main") &&
        target.getAttribute("tabindex") === "-1",
      duplicates: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
    };
  });
}
