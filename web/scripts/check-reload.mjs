// A reload shows the page, whole, where it was (t409): on the home page and
// the CI fixture's town street, on the built site (`next start`).
// - The served HTML holds the page: no Suspense hole (React's `<!--$?-->`,
//   a `<template id="B:…">`) and no skeleton; „Teraz w gminie”'s tiles, the
//   address page's band and each page's source note (its „Sprawdziliśmy”)
//   in it.
// - In Chromium, 5 hard reloads (the cache bypassed) at 1280×900, 390×844
//   and 390×667, and in mobile emulation (touch, DPR 3, CPU 4× slower) at
//   390×664 and 375×667, each from scrollY 0, about 450 and far down (900
//   on the address page, 1700 on the home page; at most the page's own
//   end): no `.app-skeleton` ever in the document, no
//   document.startViewTransition() call, layout shifts summing to 0, and
//   scrollY within 2 px of where it was at every frame after the first
//   paint.
// With SCREENSHOT_DIR, saves <page>-<width>.png at 1280 and 390 (DPR 2).
// Run after `next build`.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { finish, startServer } from "./lib/server.mjs";

const PAGES = [
  { name: "home", path: "/", far: 1700, content: /class="app-now__tiles"/ },
  {
    name: "address",
    path: "/adres/0972447-00470",
    far: 900,
    content: /class="[^"]*\bapp-band\b/,
  },
];
const DESKTOP = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 390, height: 667 },
];
const MOBILE = [
  { width: 390, height: 664 },
  { width: 375, height: 667 },
];
const RELOADS = 5;
const TOLERANCE = 2;
const SHOTS = process.env.SCREENSHOT_DIR;

// Before any of the page's own scripts, on every load: every skeleton that
// enters the document (the parser's too), every view transition started,
// every layout shift, and scrollY at every frame, with its time.
function watch() {
  const seen = { skeletons: 0, transitions: 0, shift: 0, frames: [] };
  window.__reload = seen;
  const skeleton = (node) =>
    node.nodeType === 1 &&
    (node.matches(".app-skeleton") || node.querySelector(".app-skeleton"));
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (skeleton(node)) seen.skeletons++;
  }).observe(document, { childList: true, subtree: true });
  const start = Document.prototype.startViewTransition;
  if (start)
    Document.prototype.startViewTransition = function (...args) {
      seen.transitions++;
      return start.apply(this, args);
    };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) seen.shift += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
  const frame = (time) => {
    seen.frames.push([time, window.scrollY]);
    if (seen.frames.length < 600) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** What is wrong with the served HTML of a page, as a list. */
async function servedHtml(origin, page) {
  const html = await (await fetch(`${origin}${page.path}`)).text();
  const wrong = [];
  if (html.includes("<!--$?-->")) wrong.push("a Suspense hole (<!--$?-->)");
  if (/<template id="B:/.test(html)) wrong.push("a streamed boundary (B:)");
  if (html.includes("app-skeleton")) wrong.push("a skeleton");
  const content = html.search(page.content);
  const note = html.search(/class="govuk-body-s app-quiet"/);
  const later = html.search(/hidden id="S:/);
  if (content < 0) wrong.push("no content");
  if (note < 0) wrong.push("no source note");
  if (later >= 0 && (content > later || note > later))
    wrong.push("content after a streamed part");
  return wrong.map((w) => `${page.path}: served HTML: ${w}`);
}

/** One hard reload from scrollY `target`; what is wrong, as a list. */
async function reload(page, cdp, target) {
  const at = await page.evaluate(async (y) => {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 300));
    return window.scrollY;
  }, target);
  await Promise.all([
    page.waitForEvent("load"),
    cdp.send("Page.reload", { ignoreCache: true }),
  ]);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const seen = await page.evaluate(() => {
    const paint = performance.getEntriesByName("first-paint")[0];
    return {
      ...window.__reload,
      paint: paint ? paint.startTime : 0,
      skeleton: !!document.querySelector(".app-skeleton"),
    };
  });
  const wrong = [];
  if (seen.skeletons > 0 || seen.skeleton) wrong.push("a skeleton");
  if (seen.transitions > 0)
    wrong.push(`${seen.transitions} view transition(s)`);
  if (seen.shift > 0) wrong.push(`layout shift ${seen.shift.toFixed(4)}`);
  const off = seen.frames.filter(
    ([time, y]) => time >= seen.paint && Math.abs(y - at) > TOLERANCE,
  );
  if (off.length > 0)
    wrong.push(
      `scrollY ${off.map(([, y]) => y).join(", ")} in ${off.length} frame(s), not ${at}`,
    );
  return { at, wrong };
}

async function run(browser, origin, page, viewport, mobile) {
  const context = await browser.newContext({
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  const failures = [];
  try {
    await context.addInitScript(watch);
    const tab = await context.newPage();
    const cdp = await context.newCDPSession(tab);
    if (mobile) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await tab.goto(`${origin}${page.path}`, { waitUntil: "networkidle" });
    const end = await tab.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const targets = [0, 450, page.far].map((y) => Math.min(y, end));
    for (const target of targets)
      for (let i = 1; i <= RELOADS; i++) {
        const { at, wrong } = await reload(tab, cdp, target);
        const where = `${page.path} at ${viewport.width}×${viewport.height}${mobile ? " (mobile)" : ""}, scrollY ${at}, reload ${i}`;
        failures.push(...wrong.map((w) => `${where}: ${w}`));
      }
  } finally {
    await context.close();
  }
  return failures;
}

async function screenshots(browser, origin) {
  mkdirSync(SHOTS, { recursive: true });
  for (const page of PAGES)
    for (const width of [1280, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
      });
      const tab = await context.newPage();
      await tab.goto(`${origin}${page.path}`, { waitUntil: "networkidle" });
      await tab.screenshot({
        path: path.join(SHOTS, `${page.name}-${width}.png`),
        fullPage: true,
      });
      await context.close();
    }
}

const server = await startServer(3307);
const browser = await chromium.launch();
const failures = [];
let runs = 0;
try {
  for (const page of PAGES) {
    failures.push(...(await servedHtml(server.origin, page)));
    for (const viewport of DESKTOP) {
      failures.push(...(await run(browser, server.origin, page, viewport)));
      runs++;
    }
    for (const viewport of MOBILE) {
      failures.push(
        ...(await run(browser, server.origin, page, viewport, true)),
      );
      runs++;
    }
  }
  if (SHOTS) await screenshots(browser, server.origin);
} finally {
  await browser.close();
  await server.stop();
}

finish(
  failures,
  `Reload: ${PAGES.length} pages, ${runs} viewports, 3 scroll positions × ${RELOADS} hard reloads each: the page whole in its HTML, no skeleton, no view transition, no layout shift, the scroll kept.`,
);
