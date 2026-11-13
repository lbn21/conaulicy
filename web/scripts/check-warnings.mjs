// IMGW's warnings, shown only on the address page, in
// every state, from the mock store (IMGW_WARNINGS_URL=mock:…,
// lib/imgw-mock.ts mockFiles: the files a good cron run left, checkedAgo
// minutes back), on the built site:
// - mock:none (the build's own setting in CI): nothing of IMGW's in <main>
//   on any route (no banner, no line, no card); the breadcrumbs only on
//   the address pages, the first line of the head's band in <main>;
// - the address page as built: no card above „Najbliższe 7 dni”, nothing
//   in the timeline, no tag anywhere; /pogoda is a 404; nothing on /smieci;
// - per state, on its preview page (/podglad/imgw/<state>,
//   lib/imgw-preview.ts, prerendered outside production): a card per
//   warning, highest first, as the address page draws them: its band
//   („Stopień N z 3”, the meter filled up to N), the event (h2), when
//   („Trwa do …” or „Od … do …”) and IMGW's own description in GOV.UK's
//   details; no tag; the notice, if any, in the inset above (its link
//   IMGW's page);
// - three warnings: axe at 375 and 1280 px, keyboard focus on a card's
//   „Co przekazuje IMGW”, 320 px and 200% zoom with no horizontal scroll,
//   the bands' fills (IMGW's level colours, lib/palette.ts) and contrast;
// - stale (the last good check over an hour back: the notice, the warning
//   still shown; with no warning, the notice alone), too old (3 hours: the
//   notice alone) and a store that cannot be read (the notice alone).
// Every page is prerendered by the build, so one server reads them all.
// With SCREENSHOT_DIR, saves <width>-<state>.png (DPR 2). Run after
// `next build`.
//
// With --ci (CI): mock:none and the three warnings only; the
// other states' copy and order are lib/imgw-shown.test.ts's and
// lib/weather-module.test.ts's. Without it, every state: run it by hand
// when the weather's display changes.
import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { IMGW_SCENARIOS } from "../lib/imgw-preview.ts";
import { WARNING_LEVELS } from "../lib/palette.ts";
import {
  closeRenderedPages,
  finish,
  notFoundAt,
  ROUTES,
  renderedPage,
  startServer,
  withoutReactMarks,
} from "./lib/server.mjs";

const HUB = "/adres/0972447-00470";
// No subpage for the weather any more: a 404.
const WEATHER = `${HUB}/pogoda`;
// A card's details' summary (components/warning-cards.tsx), by its markup.
const DETAILS = ".app-warning .govuk-details__summary";
const WIDTHS = [375, 1280];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SHOTS = process.env.SCREENSHOT_DIR;
const CI = process.argv.includes("--ci");

// Each preview scenario (lib/imgw-preview.ts, /podglad/imgw/<name>):
// levels, the warnings expected, highest first; notice: the notice first.
const EXPECTED = {
  "l1-active": { levels: [1] },
  "l1-upcoming": { levels: [1] },
  "l2-active": { levels: [2] },
  "l2-upcoming": { levels: [2] },
  "l3-active": { levels: [3] },
  "l3-upcoming": { levels: [3] },
  "two-l2-l3": { levels: [3, 2] },
  "three-l1-l2-l3": { levels: [3, 2, 1] },
  "cross-day-upcoming": { levels: [2] },
  stale: { levels: [2], notice: true },
  "stale-none": { levels: [], notice: true },
  "too-old": { levels: [], notice: true },
  unreadable: { levels: [], notice: true },
};
const STATES = Object.keys(IMGW_SCENARIOS).map((name) => ({
  name,
  ...EXPECTED[name],
}));
const THREE = "three-l1-l2-l3";
const preview = (name) => `/podglad/imgw/${name}`;

const failures = [];

// An icon (components/icon.tsx): decorative, aria-hidden, Lucide's shapes.
const ICON =
  '<svg aria-hidden="true" focusable="false" class="app-icon"[^>]*>(?:(?!</svg>).)*</svg>';
// A card, by structure only, never its words: the level's band holds the
// meter and the level's digit in text (never colour alone), then a
// heading, when, and IMGW's words in a details, each with text.
const CARD = new RegExp(
  `<section class="app-warning app-warning--([1-3])" aria-labelledby="ostrzezenie-([^"]+)"><p class="app-warning__level[^"]*"><span class="app-warning__meter" aria-hidden="true">((?:<span(?: class="app-warning__on")?></span>){3})</span>${ICON}[^<]*\\1[^<]*</p><div class="app-warning__body[^"]*"><h2 id="ostrzezenie-\\2" class="govuk-heading-m[^"]*">(?:<span class="app-tile[^"]*">${ICON}</span>)?[^<]+</h2><p class="govuk-body">[^<]+</p><details class="govuk-details[^"]*"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">[^<]+</span></summary><div class="govuk-details__text">[^<]+</div></details></div></section>`,
  "gu",
);
// The notice: a line in the inset linking IMGW's live page.
const NOTICE =
  /<div class="govuk-inset-text">(?:(?!<\/div>)[\s\S])*<a href="https:\/\/meteo\.imgw\.pl\/" class="govuk-link">/;

// GOV.UK's breadcrumbs only on an address page (none on a flat site, the
// home page or a 404), one trail, the first line of the page head's band
// in <main>, so the band runs unbroken from the header (t400).
function crumbsPlaced(route, html) {
  const address = route.path.startsWith("/adres/") && !route.status;
  const trails = html.match(/<nav class="govuk-breadcrumbs/g)?.length ?? 0;
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const inBand =
    /<div class="app-band"><nav class="govuk-breadcrumbs[^"]*"[^>]*><ol class="govuk-breadcrumbs__list">/.test(
      main,
    );
  if (address ? trails !== 1 || !inBand : trails !== 0)
    failures.push(
      `${route.path}: ${trails} breadcrumb trail(s)${address ? ", want one, the first line of <main>'s .app-band" : ", want none"}`,
    );
}

// The address page with the state's warnings: a card each, highest
// first, above the timeline, nothing of it in the timeline, no tag; /pogoda
// a 404; nothing of it on /smieci. React's text separators (<!-- -->) left
// out.
async function hubChecks(origin, state) {
  const label = `${state.name} ${HUB}`;
  const [hub, waste] = await Promise.all(
    [HUB, `${HUB}/smieci`].map(async (p) => {
      const { status, html } = await renderedPage(origin + p);
      if (status !== 200) failures.push(`${state.name} ${p}: HTTP ${status}`);
      return html.replace(/<!--.*?-->/g, "");
    }),
  );
  const weatherGone = await notFoundAt(origin + WEATHER);
  const timelineAt = hub.indexOf('<section aria-labelledby="najblizsze-dni">');
  const timeline = hub.slice(timelineAt, hub.indexOf("</section>", timelineAt));
  const cards = [...hub.matchAll(CARD)];
  const levels = cards.map(([, level]) => Number(level));
  const meters = cards.map(([, , , steps]) => steps.split("__on").length - 1);
  const lastCard = cards.at(-1);
  const cardsEnd = lastCard ? lastCard.index + lastCard[0].length : -1;
  const imgwLinks = hub.split('<a href="https://meteo.imgw.pl/"').length - 1;
  const problems = [
    levels.join() !== state.levels.join() &&
      `cards ${levels}, want ${state.levels}`,
    (hub.match(/class="app-warning /g)?.length ?? 0) !== cards.length &&
      "a card off its markup",
    meters.join() !== levels.join() && `meters ${meters}, want ${levels}`,
    // Directly above „Najbliższe 7 dni”.
    lastCard &&
      cardsEnd !== timelineAt &&
      "the cards not right above the timeline",
    /app-warning/.test(timeline) && "a warning in the timeline",
    /govuk-tag/.test(hub) && "a tag on the address page",
    !/<h2 id="najblizsze-dni"[^>]*>[^<]/.test(hub) && "no timeline heading",
    imgwLinks !== (state.notice ? 1 : 0) &&
      `${imgwLinks} links to IMGW on the address page`,
    weatherGone && `${WEATHER}: ${weatherGone}`,
    hub.includes(`href="${WEATHER}`) && `a link to ${WEATHER}`,
    // The notice: in the inset above the cards; none when fresh.
    NOTICE.test(hub) !== Boolean(state.notice) && "the notice",
    /app-warning/.test(waste) && "a warning on /smieci",
  ].filter(Boolean);
  if (problems.length > 0) failures.push(`${label}: ${problems.join("; ")}`);
  else console.log(`ok    ${label}: ${state.levels.length} cards`);
}

// A scenario's preview page (/podglad/imgw/<name>): its cards, highest
// first, each with its meter; the notice in the inset; no tag. The same
// markup as the address page's (components/warning-cards.tsx).
async function previewChecks(origin, state) {
  const label = preview(state.name);
  const { status, html: raw } = await renderedPage(origin + label);
  if (status !== 200) failures.push(`${label}: HTTP ${status}`);
  const page = raw.replace(/<!--.*?-->/g, "");
  const cards = [...page.matchAll(CARD)];
  const levels = cards.map(([, level]) => Number(level));
  const meters = cards.map(([, , , steps]) => steps.split("__on").length - 1);
  const problems = [
    levels.join() !== state.levels.join() &&
      `cards ${levels}, want ${state.levels}`,
    (page.match(/class="app-warning /g)?.length ?? 0) !== cards.length &&
      "a card off its markup",
    meters.join() !== levels.join() && `meters ${meters}, want ${levels}`,
    /govuk-tag/.test(page) && "a tag",
    NOTICE.test(page) !== Boolean(state.notice) && "the notice",
  ].filter(Boolean);
  if (problems.length > 0) failures.push(`${label}: ${problems.join("; ")}`);
  else console.log(`ok    ${label}: ${state.levels.length} cards`);
}

// A page in a browser at `width`, its content in.
async function open(browser, origin, width, scale = 2, page = HUB) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: scale,
  });
  const tab = await context.newPage();
  await tab.goto(origin + page, { waitUntil: "load" });
  return { context, page: tab };
}

// Tab (keyboard only) to the first element matching `text` (a selector):
// GOV.UK's focus style on it.
async function focusCheck(page, text, where) {
  let focused = null;
  for (let i = 0; i < 80 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate((selector) => {
      const el = document.activeElement;
      if (!el?.matches(selector)) return null;
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor === "rgb(255, 221, 0)",
        shadow: s.boxShadow !== "none",
      };
    }, text);
  }
  if (!focused) failures.push(`focus: Tab never reached „${text}” on ${where}`);
  else if (!focused.background || !focused.shadow)
    failures.push(`focus: „${text}” on ${where} not in GOV.UK's focus style`);
  else console.log(`ok    focus on „${text}” (${where})`);
}

// With SCREENSHOT_DIR, the page per width for the reviewer.
async function shoot(browser, origin, name, at) {
  if (!SHOTS) return;
  for (const width of WIDTHS) {
    const { context, page } = await open(browser, origin, width, 2, at);
    await page.screenshot({
      path: path.join(SHOTS, `${width}-${name}.png`),
      fullPage: true,
    });
    await context.close();
  }
}

// WCAG 2.x contrast of two computed rgb() colours.
function ratio(a, b) {
  const lum = (css) => {
    const [r, g, bl] = css
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((c) => {
        const s = Number(c) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Three warnings (their preview page, `at`): axe, focus, the bands, reflow.
async function deepChecks(browser, origin, at) {
  for (const width of WIDTHS) {
    const { context, page } = await open(browser, origin, width, 2, at);
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include("main")
      .analyze();
    for (const v of violations)
      failures.push(`${at} [${width}px]: axe ${v.id}: ${v.help}`);
    if (violations.length === 0) console.log(`ok    axe ${at} [${width}px]`);
    // A card's details, by keyboard.
    await focusCheck(page, DETAILS, `${at} [${width}px]`);
    await context.close();
  }

  const { context, page } = await open(browser, origin, 1280, 2, at);
  // The bands: IMGW's level colours, their text readable.
  const bands = await page.evaluate(() =>
    [...document.querySelectorAll("main .app-warning")].map((card) => {
      const s = getComputedStyle(card.querySelector(".app-warning__level"));
      return [card.className, s.color, s.backgroundColor];
    }),
  );
  if (bands.length !== 3) failures.push(`${bands.length} cards, want 3`);
  const rgb = (hex) =>
    `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  for (const [cls, fg, bg] of bands) {
    const level = /app-warning--([1-3])/.exec(cls)?.[1];
    const want = rgb(WARNING_LEVELS[`warning-level-${level}`]);
    if (bg !== want)
      failures.push(`band ${cls}: background ${bg}, want ${want} (IMGW)`);
    const r = ratio(fg, bg);
    console.log(`      ${cls}: ${fg} on ${bg}, ${r.toFixed(2)}:1`);
    if (r < 4.5) failures.push(`contrast: ${cls} ${r.toFixed(2)} < 4.5`);
  }
  await context.close();

  // Reflow: 320 px, and 1280 px at 200% zoom (a 640 px viewport at DPR 2).
  for (const [width, scale] of [
    [320, 1],
    [640, 2],
  ]) {
    const narrow = await open(browser, origin, width, scale, at);
    const [scroll, client] = await narrow.page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    const label = `${at} ${scale === 2 ? "200% zoom (640 px)" : `${width} px`}`;
    if (scroll > client)
      failures.push(`${label}: horizontal scroll (${scroll} > ${client})`);
    else
      console.log(
        `ok    ${label}: no horizontal scroll (${scroll} = ${client})`,
      );
    await narrow.context.close();
  }
}

const browser = await chromium.launch();
const server = await startServer(3320);
try {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // The build as it is (CI: mock:none): nothing of IMGW's on any route.
  for (const route of ROUTES) {
    if (route.status) {
      const html = await (await fetch(server.origin + route.path)).text();
      crumbsPlaced(route, withoutReactMarks(html));
      continue;
    }
    const shown = (await renderedPage(server.origin + route.path)).html;
    crumbsPlaced(route, shown);
    const main = shown.slice(shown.indexOf("<main"), shown.indexOf("</main>"));
    if (/govuk-notification-banner|app-warning/.test(main))
      failures.push(`${route.path}: a banner, a line or a warning of IMGW's`);
  }
  await hubChecks(server.origin, { name: "none", levels: [] });
  await shoot(browser, server.origin, "none", HUB);
  console.log(
    `ok    ${process.env.IMGW_WARNINGS_URL}: no IMGW banner on ${ROUTES.length} routes`,
  );

  // Every scenario, prerendered by this build (outside production).
  for (const state of CI
    ? STATES.filter((state) => state.name === THREE)
    : STATES) {
    await previewChecks(server.origin, state);
    if (state.name === THREE)
      await deepChecks(browser, server.origin, preview(THREE));
    await shoot(browser, server.origin, state.name, preview(state.name));
  }
} finally {
  await closeRenderedPages();
  await browser.close();
  await server.stop();
}

finish(
  failures,
  `IMGW warnings: ${CI ? "mock:none and three warnings (--ci)" : `${STATES.length + 1} states`}, each once, only on the address page and its preview.`,
);
