// IMGW's warnings, shown only on the address page, in
// every state, from the mock store (IMGW_WARNINGS_URL=mock:…,
// lib/imgw-mock.ts mockFiles: the files a good cron run left, checkedAgo
// minutes back), on the built site:
// - mock:none (the build's own setting in CI): nothing of IMGW's in <main>
//   on any route (no banner, no line, no card); the breadcrumbs only on
//   the address pages, right before <main>;
// - per state, on the address page: a card per warning, highest first,
//   directly above „Najbliższe 7 dni”: its band („Stopień N z
//   3”, the meter filled up to N), the event (h2), when („Trwa do …” or
//   „Od … do …”) and IMGW's own description in GOV.UK's details; nothing
//   of it in the timeline, no tag anywhere; the notice, if any, in the
//   inset above (its link IMGW's page); /pogoda is a 404; nothing of it on
//   /smieci;
// - three warnings: axe at 375 and 1280 px, keyboard focus on a card's
//   „Co przekazuje IMGW”, 320 px and 200% zoom with no horizontal scroll,
//   the bands' fills (IMGW's level colours, lib/palette.ts) and contrast;
// - stale (the last good check over an hour back: the notice, the warning
//   still shown; with no warning, the notice alone), too old (3 hours: the
//   notice alone) and a store that cannot be read (the notice alone; the
//   404 page as ever).
// Each state's pages are dropped from the ISR cache first, so they render
// with that server's setting. With SCREENSHOT_DIR, saves
// <width>-<state>.png of the address page (DPR 2). Run after `next build`.
//
// With --ci (CI): mock:none and the three warnings only; the
// other states' copy and order are lib/imgw-shown.test.ts's and
// lib/weather-module.test.ts's. Without it, every state: run it by hand
// when the weather's display changes.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
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

// levels: the warnings expected, highest first; notice: the notice first.
const STATES = [
  ...[1, 2, 3].flatMap((level) => [
    {
      name: `l${level}-active`,
      url: `mock:1809?level=${level}`,
      levels: [level],
    },
    {
      name: `l${level}-upcoming`,
      url: `mock:1809?level=${level}&start=upcoming`,
      levels: [level],
    },
  ]),
  { name: "two-l2-l3", url: "mock:1809?level=2&also=3", levels: [3, 2] },
  {
    name: "three-l1-l2-l3",
    url: "mock:1809?level=1&also=2,3",
    levels: [3, 2, 1],
  },
  {
    name: "cross-day-upcoming",
    url: "mock:1809?level=2&start=night",
    levels: [2],
  },
  // The last good check over an hour back, and over three hours.
  {
    name: "stale",
    url: "mock:1809?level=2&checkedAgo=70",
    levels: [2],
    notice: "stale",
  },
  {
    name: "stale-none",
    url: "mock:none?checkedAgo=70",
    levels: [],
    notice: "stale-none",
  },
  {
    name: "too-old",
    url: "mock:1809?level=2&checkedAgo=190",
    levels: [],
    notice: "too-old",
  },
  // The store cannot be read: an expected error, rendered as a notice.
  {
    name: "unreadable",
    url: "mock:1809?fail=500",
    levels: [],
    notice: "unreadable",
  },
];
const THREE = "three-l1-l2-l3";
// A 404, as ever while the store cannot be read (app/not-found.tsx).
const NOT_FOUND = "/nie-ma-takiej-strony";

const failures = [];
let port = 3320;

// Drop a page from the ISR cache, so the next request renders it: the
// build's prerendered copy and any copy rendered since (route-cache). Cached
// by its path, never its query.
function forget(page) {
  const name = page.slice(1).split("?")[0];
  const routeCache = ".next/server/route-cache/APP_PAGE";
  const bases = [
    path.join(".next/server/app", name),
    ...(existsSync(routeCache) ? readdirSync(routeCache) : []).map((build) =>
      path.join(routeCache, build, "$", name),
    ),
  ];
  for (const base of bases)
    for (const ext of [".html", ".rsc", ".meta", ".segments"])
      rmSync(base + ext, { recursive: true, force: true });
}

// GOV.UK's breadcrumbs only on an address page (none on a flat site, the
// home page or a 404), before <main>, as GOV.UK places them: the skip link
// skips them along with the header. Read without React's marks:
// the @breadcrumbs slot (app/layout.tsx) is a boundary of its own, and so
// are an address page's breadcrumbs.
function crumbsPlaced(route, html) {
  const address = route.path.startsWith("/adres/") && !route.status;
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const before =
    /<nav class="govuk-breadcrumbs[^"]*"[^>]*><ol class="govuk-breadcrumbs__list">(?:(?!<\/nav>)[\s\S])*<\/nav><main class="govuk-main-wrapper" id="main-content">/.test(
      html,
    );
  if (main.includes("govuk-breadcrumbs") || before !== address)
    failures.push(
      `${route.path}: ${address ? "no breadcrumbs right before" : "breadcrumbs, or some in"} <main>`,
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
  // An icon (components/icon.tsx): decorative, aria-hidden, Lucide's shapes.
  const ICON =
    '<svg aria-hidden="true" focusable="false" class="app-icon"[^>]*>(?:(?!</svg>).)*</svg>';
  // Structure only, never its words: the level's band holds the meter and
  // the level's digit in text (never colour alone), then a heading, when,
  // and IMGW's words in a details, each with text.
  const card = new RegExp(
    `<section class="app-warning app-warning--([1-3])" aria-labelledby="ostrzezenie-([^"]+)"><p class="app-warning__level[^"]*"><span class="app-warning__meter" aria-hidden="true">((?:<span(?: class="app-warning__on")?></span>){3})</span>${ICON}[^<]*\\1[^<]*</p><div class="app-warning__body[^"]*"><h2 id="ostrzezenie-\\2" class="govuk-heading-m[^"]*">(?:<span class="app-tile[^"]*">${ICON}</span>)?[^<]+</h2><p class="govuk-body">[^<]+</p><details class="govuk-details[^"]*"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">[^<]+</span></summary><div class="govuk-details__text">[^<]+</div></details></div></section>`,
    "gu",
  );
  const cards = [...hub.matchAll(card)];
  const levels = cards.map(([, level]) => Number(level));
  const meters = cards.map(([, , , steps]) => steps.split("__on").length - 1);
  const lastCard = cards.at(-1);
  const cardsEnd = lastCard ? lastCard.index + lastCard[0].length : -1;
  const imgwLinks = hub.split('<a href="https://meteo.imgw.pl/"').length - 1;
  // The notice: a line in the inset linking IMGW's live page.
  const notice =
    /<div class="govuk-inset-text">(?:(?!<\/div>)[\s\S])*<a href="https:\/\/meteo\.imgw\.pl\/" class="govuk-link">/;
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
    notice.test(hub) !== Boolean(state.notice) && "the notice",
    /app-warning/.test(waste) && "a warning on /smieci",
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
  await tab
    .waitForFunction(
      () =>
        !document.querySelector(".app-skeleton") &&
        document.querySelector("main h1"),
      null,
      { timeout: 10_000 },
    )
    .catch(() => {});
  return { context, page: tab };
}
const openHub = (browser, origin, width, scale = 2) =>
  open(browser, origin, width, scale, HUB);

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

// With SCREENSHOT_DIR, the address page per width for the reviewer.
async function shoot(browser, origin, name) {
  if (!SHOTS) return;
  for (const width of WIDTHS) {
    const { context, page } = await openHub(browser, origin, width);
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

// Three warnings: axe, focus, the bands, reflow.
async function deepChecks(browser, origin) {
  for (const width of WIDTHS) {
    const { context, page } = await openHub(browser, origin, width);
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include("main")
      .analyze();
    for (const v of violations)
      failures.push(`${HUB} [${width}px]: axe ${v.id}: ${v.help}`);
    if (violations.length === 0) console.log(`ok    axe ${HUB} [${width}px]`);
    // A card's details, by keyboard.
    await focusCheck(page, DETAILS, `${HUB} [${width}px]`);
    await context.close();
  }

  const { context, page } = await openHub(browser, origin, 1280);
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
    const narrow = await openHub(browser, origin, width, scale);
    const [scroll, client] = await narrow.page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    const label = `${HUB} ${scale === 2 ? "200% zoom (640 px)" : `${width} px`}`;
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
try {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // The build as it is (CI: mock:none): nothing of IMGW's on any route.
  const plain = await startServer(port++);
  try {
    for (const route of ROUTES) {
      // The breadcrumbs as the browser shows them: an address page reads its
      // place behind <Suspense> (components/place-suspense.tsx),
      // so a house number not prerendered streams them after <main>,
      // in React's hidden <div>, to be moved in place.
      if (route.status) {
        const html = await (await fetch(plain.origin + route.path)).text();
        crumbsPlaced(route, withoutReactMarks(html));
        continue;
      }
      const shown = (await renderedPage(plain.origin + route.path)).html;
      crumbsPlaced(route, shown);
      const main = shown.slice(
        shown.indexOf("<main"),
        shown.indexOf("</main>"),
      );
      if (/govuk-notification-banner|app-warning/.test(main))
        failures.push(`${route.path}: a banner, a line or a warning of IMGW's`);
    }
    await hubChecks(plain.origin, { name: "none", levels: [] });
    await shoot(browser, plain.origin, "none");
    console.log(
      `ok    ${process.env.IMGW_WARNINGS_URL}: no IMGW banner on ${ROUTES.length} routes`,
    );
  } finally {
    await plain.stop();
  }

  for (const state of CI
    ? STATES.filter((state) => state.name === THREE)
    : STATES) {
    for (const page of [HUB, `${HUB}/smieci`]) forget(page);
    const server = await startServer(port++, { IMGW_WARNINGS_URL: state.url });
    try {
      await hubChecks(server.origin, state);
      if (state.name === THREE) await deepChecks(browser, server.origin);
      await shoot(browser, server.origin, state.name);
      if (state.name === "unreadable") {
        const response = await fetch(server.origin + NOT_FOUND);
        if (response.status !== 404)
          failures.push(`unreadable ${NOT_FOUND}: HTTP ${response.status}`);
        else console.log(`ok    unreadable ${NOT_FOUND}: HTTP 404`);
      }
    } finally {
      await server.stop();
    }
  }
  for (const page of [HUB, `${HUB}/smieci`]) forget(page);
} finally {
  await closeRenderedPages();
  await browser.close();
}

finish(
  failures,
  `IMGW warnings: ${CI ? "mock:none and three warnings (--ci)" : `${STATES.length + 1} states`}, each once, only on the address page.`,
);
