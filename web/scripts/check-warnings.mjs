// IMGW's warnings, shown only on the address page (task 257), in every
// state, from the mock store (IMGW_WARNINGS_URL=mock:…, lib/imgw-mock.ts
// mockFiles: the files a good cron run left, checkedAgo minutes back), on
// the built site:
// - mock:none (the build's own setting in CI): nothing of IMGW's in <main>
//   on any route but the address pages (no banner, no line), whose
//   „Pogoda” says „Brak ostrzeżeń …” once and „Najbliższe dni” has no
//   warning; the breadcrumbs only on the address pages, right before
//   <main> (task 149);
// - per state, on the address page: each warning once in „Najbliższe dni”
//   (its day lead, the event, its tag, until when, „Cały powiat.”, no
//   link; task 260), the only level tags on the page; „Pogoda”
//   never lists them again: the notice first if any (its link IMGW's
//   page), then per warning, highest first, which one in words and IMGW's
//   own description with its probability, then „Szczegóły i mapa na
//   meteo.imgw.pl”, no tag; nothing of it on /smieci;
// - three warnings: axe at 375 and 1280 px, keyboard focus on IMGW's link,
//   320 px and 200% zoom with no horizontal scroll, the tags' fills (IMGW's
//   level colours, lib/palette.ts) and contrast;
// - stale (the last good check over an hour back: the notice, the warning
//   still listed; with no warning, the notice alone), too old (3 hours: the
//   notice alone) and a store that cannot be read (the notice alone; the
//   404 page as ever).
// Each state's pages are dropped from the ISR cache first, so they render
// with that server's setting. With SCREENSHOT_DIR, saves
// <width>-<state>.png of the address page (DPR 2). Run after `next build`.
//
// With --ci (CI, task 252): mock:none and the three warnings only; the
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
  ROUTES,
  renderedPage,
  startServer,
  withoutReactMarks,
} from "./lib/server.mjs";

const HUB = "/adres/0972447-00470";
// The hub's weather section with no warning (lib/weather-module.ts).
const NO_WARNINGS = "Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.";
const MORE = "Szczegóły i mapa na meteo.imgw.pl";
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

const DAY =
  "(?:niedzieli|poniedziałku|wtorku|środy|czwartku|piątku|soboty) \\d{1,2} \\p{L}+";
const TIME = "\\d{1,2}:\\d{2}";
// The last data's time: its day too when not today.
const SINCE = `(?:${DAY}, )?${TIME}`;
const NOTICE = {
  stale: `Nie udało się teraz pobrać ostrzeżeń IMGW\\. Pokazujemy ostatnie dane z ${SINCE}\\.`,
  "stale-none": `Nie udało się teraz pobrać ostrzeżeń IMGW\\. Ostatnie dane mamy z ${SINCE}\\.`,
  "too-old": `Od ${SINCE} nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy\\.`,
  unreadable: "Nie udało się teraz sprawdzić ostrzeżeń IMGW\\.",
};
const COLOUR = {
  1: "govuk-tag--yellow",
  2: "govuk-tag--orange",
  3: "govuk-tag--red",
};

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
// skips them along with the header (task 149). Read without React's marks:
// the @breadcrumbs slot (app/layout.tsx) is a boundary of its own, and so
// are an address page's breadcrumbs (task 231).
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

// The address page with the state's warnings: each once, in „Najbliższe
// dni”, the only level tags on the page; „Pogoda” IMGW's words, never the list
// again; nothing of it on /smieci.
async function hubChecks(origin, state) {
  const label = `${state.name} ${HUB}`;
  const [hub, waste] = await Promise.all(
    [HUB, `${HUB}/smieci`].map(async (p) => {
      const { status, html } = await renderedPage(origin + p);
      if (status !== 200) failures.push(`${state.name} ${p}: HTTP ${status}`);
      return html;
    }),
  );
  const n = state.levels.length;
  const cards = [
    ...hub.matchAll(
      /<section id="([a-z]+)" aria-labelledby="\1-heading"><h2 id="\1-heading" class="govuk-heading-l">([^<]*)</g,
    ),
  ].map(([, , title]) => title);
  // „Najbliższe dni”'s cards (task 261): a warning's is its type's tag,
  // its hours, IMGW's event and level's tag, „Cały powiat.”.
  const lines = [
    ...hub.matchAll(
      /<li class="app-timeline__card govuk-!-padding-3">([\s\S]*?)<\/li>/g,
    ),
  ]
    .map(([, line]) => line)
    .filter((line) => line.includes("Ostrzeżenie IMGW"));
  const line = new RegExp(
    // Its hours: from (the start's day too when it began before its day),
    // to (the end's day too when after it).
    `^<p class="govuk-body govuk-!-margin-bottom-2"><svg [^>]*><path [^>]*></path></svg><strong class="govuk-tag govuk-tag--purple">Pogoda</strong></p>(?:<p class="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">Od (?:${DAY}, )?${TIME}(?: do (?:${DAY}, )?${TIME})?</p>)?<p class="govuk-body govuk-!-margin-bottom-0">Ostrzeżenie IMGW – silny wiatr <strong class="govuk-tag govuk-tag--(?:yellow|orange|red)">Stopień [1-3] z 3</strong></p><p class="govuk-body govuk-!-margin-top-1 govuk-!-margin-bottom-0">Cały powiat\\.</p>$`,
    "u",
  );
  const from = hub.indexOf('<section id="pogoda"');
  const section = hub.slice(from, hub.indexOf("</section>", from));
  // Per warning, highest first: which one, then IMGW's own words.
  const described = [
    ...section.matchAll(
      /<p class="govuk-body govuk-!-margin-bottom-2">Silny wiatr, stopień ([1-3]) z 3<\/p><p class="govuk-body">Prognozuje się [^<]+ Prawdopodobieństwo: \d{1,3}%\.<\/p>/g,
    ),
  ].map(([, level]) => Number(level));
  const more = `<p class="govuk-body"><a href="https://meteo.imgw.pl/" class="govuk-link">${MORE}</a></p>`;
  // IMGW's level tags; the timeline's type tags are besides (task 261).
  const tags =
    hub.match(/<strong class="govuk-tag govuk-tag--(?:yellow|orange|red)"/g)
      ?.length ?? 0;
  // As markup: the text alone is also in React's payload (its scripts).
  const brak = hub.split(`<p class="govuk-body">${NO_WARNINGS}</p>`).length - 1;
  const problems = [
    lines.length !== n && `${lines.length} warning lines, want ${n}`,
    ...lines.filter((l) => !line.test(l)).map((l) => `line ${l}`),
    tags !== n && `${tags} level tags on the page, want ${n}`,
    section.includes("govuk-tag") && "a tag in Pogoda",
    described.join() !== state.levels.join() &&
      `Pogoda describes ${described}, want ${state.levels}`,
    section.includes(more) !== n > 0 && `„${MORE}” with ${n} warnings`,
    cards.join() !== "Śmieci,Woda,Pogoda" && `sections ${cards}`,
    // The notice first, with IMGW's link; none when fresh.
    (state.notice
      ? !new RegExp(
          `<h2 id="pogoda-heading" class="govuk-heading-l">Pogoda</h2><p class="govuk-body">${NOTICE[state.notice]} Aktualne znajdziesz na <a href="https://meteo\\.imgw\\.pl/" class="govuk-link">meteo\\.imgw\\.pl</a>\\.</p>`,
          "u",
        ).test(section)
      : section.includes("nie udało się")) && "Pogoda's notice",
    // „Brak ostrzeżeń” once, only fresh with none.
    brak !== (n === 0 && !state.notice ? 1 : 0) && `${brak} „Brak ostrzeżeń”`,
    waste.includes("ostrzeżenie IMGW") && "a warning line on /smieci",
  ].filter(Boolean);
  if (problems.length > 0) failures.push(`${label}: ${problems.join("; ")}`);
  else console.log(`ok    ${label}: ${n} warnings, each once`);
}

// The address page in a browser at `width`, its content in.
async function openHub(browser, origin, width, scale = 2) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  await page.goto(origin + HUB, { waitUntil: "load" });
  await page
    .waitForFunction(
      () =>
        !document.querySelector(".app-skeleton") &&
        document.querySelector("#pogoda"),
      null,
      { timeout: 10_000 },
    )
    .catch(() => {});
  return { context, page };
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

// Three warnings: axe, focus, tags, reflow.
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
    await context.close();
  }

  const { context, page } = await openHub(browser, origin, 1280);
  // Tab to IMGW's link (keyboard only): GOV.UK's focus style.
  let focused = null;
  for (let i = 0; i < 80 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate((text) => {
      const el = document.activeElement;
      if (el?.textContent !== text) return null;
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor === "rgb(255, 221, 0)",
        shadow: s.boxShadow !== "none",
      };
    }, MORE);
  }
  if (!focused) failures.push(`focus: Tab never reached „${MORE}”`);
  else if (!focused.background || !focused.shadow)
    failures.push(`focus: „${MORE}” not in GOV.UK's focus style`);
  else console.log(`ok    focus on „${MORE}”`);

  // The tags (in „Najbliższe dni”): IMGW's level colours, readable.
  const tags = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "main :is(.govuk-tag--yellow, .govuk-tag--orange, .govuk-tag--red)",
      ),
    ].map((t) => {
      const s = getComputedStyle(t);
      return [t.className, s.color, s.backgroundColor];
    }),
  );
  if (tags.length !== 3) failures.push(`${tags.length} tags, want 3`);
  const rgb = (hex) =>
    `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  for (const [cls, fg, bg] of tags) {
    const level = Object.keys(COLOUR).find((l) => cls.includes(COLOUR[l]));
    const want = rgb(WARNING_LEVELS[`warning-level-${level}`]);
    if (bg !== want)
      failures.push(`tag ${cls}: background ${bg}, want ${want} (IMGW)`);
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
    const label = scale === 2 ? "200% zoom (640 px)" : `${width} px`;
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

  // The build as it is (CI: mock:none): nothing of IMGW's but the hub's
  // „Pogoda”.
  const plain = await startServer(port++);
  try {
    for (const route of ROUTES) {
      // The breadcrumbs as the browser shows them: an address page reads its
      // place behind <Suspense> (components/place-suspense.tsx, task 231),
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
      if (
        /govuk-notification-banner|Ostrzeżenia IMGW|ostrzeżenie IMGW/.test(main)
      )
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
