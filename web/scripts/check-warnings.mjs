// IMGW's warnings, shown only on the address page and its /pogoda
// subpage (tasks 257, 263), in every state, from the mock store
// (IMGW_WARNINGS_URL=mock:…, lib/imgw-mock.ts mockFiles: the files a good
// cron run left, checkedAgo minutes back), on the built site:
// - mock:none (the build's own setting in CI): nothing of IMGW's in <main>
//   on any route (no banner, no line), /pogoda says „Brak ostrzeżeń …”
//   once and the timeline has no warning; the breadcrumbs only on the
//   address pages, right before <main> (task 149);
// - per state, on the address page: each warning once in the timeline,
//   on its first day (or today, when it began before), each later day it
//   covers „trwa”: its row („Ostrzeżenie IMGW”, its tag, the event, when)
//   and „Szczegóły” to /pogoda, the only tags on the page; the notice, if
//   any, in the inset above the timeline (its link IMGW's page); never
//   IMGW's own description. /pogoda: the notice first if any, then per
//   warning, highest first, a summary card with its tag and IMGW's own
//   description with its probability, then the source, IMGW's only link
//   (task 279); nothing of it on /smieci;
// - three warnings: axe at 375 and 1280 px on the address page and
//   /pogoda, keyboard focus on a timeline row's „Szczegóły” and on IMGW's
//   link, 320 px and 200% zoom with no horizontal scroll on both, the
//   tags' fills (IMGW's level colours, lib/palette.ts) and contrast;
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
const WEATHER = `${HUB}/pogoda`;
// /pogoda with no warning (lib/weather-module.ts).
const NO_WARNINGS = "Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.";
// /pogoda's one link to IMGW: its source.
const SOURCE = "IMGW-PIB";
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

// The address page with the state's warnings: each once in the timeline,
// the only tags on the page, IMGW's words only on /pogoda; nothing of it
// on /smieci. React's text separators (<!-- -->) left out.
async function hubChecks(origin, state) {
  const label = `${state.name} ${HUB}`;
  const [hub, weather, waste] = await Promise.all(
    [HUB, WEATHER, `${HUB}/smieci`].map(async (p) => {
      const { status, html } = await renderedPage(origin + p);
      if (status !== 200) failures.push(`${state.name} ${p}: HTTP ${status}`);
      return html.replace(/<!--.*?-->/g, "");
    }),
  );
  const n = state.levels.length;
  const headings = [
    ...hub.matchAll(/<h2 id="[a-z-]+" class="govuk-heading-m">([^<]*)</g),
  ].map(([, title]) => title);
  // The timeline's days (not „Później”), each its IMGW rows.
  const timeline = hub.slice(
    hub.indexOf('<ol class="app-timeline">'),
    hub.indexOf("</ol>", hub.indexOf('<ol class="app-timeline">')),
  );
  const days = timeline
    .split(/<li(?: class="([^"]*)")?>/)
    .slice(1)
    .reduce((list, part, i, parts) => {
      if (i % 2 === 0 && !(part ?? "").includes("app-timeline__later"))
        list.push(parts[i + 1]);
      return list;
    }, []);
  const row = new RegExp(
    `^<dt class="govuk-summary-list__key">Ostrzeżenie IMGW</dt><dd class="govuk-summary-list__value"><p class="govuk-body-s govuk-!-margin-bottom-0"><strong class="govuk-tag govuk-tag--(?:yellow|orange|red)">Stopień [1-3] z 3</strong> Silny wiatr(?:, (?:trwa )?(?:od (?:${DAY}, )?${TIME} )?do (?:${DAY}, )?${TIME})?\\.</p></dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="${WEATHER}">Szczegóły<span class="govuk-visually-hidden"> o ostrzeżeniu IMGW, \\p{L}+, \\d{1,2} \\p{L}+</span></a></dd>$`,
    "u",
  );
  const rows = days.flatMap((day, i) =>
    [
      ...day.matchAll(
        /<div class="govuk-summary-list__row[^"]*">(<dt class="govuk-summary-list__key">Ostrzeżenie IMGW<\/dt>[\s\S]*?)<\/div>/g,
      ),
    ].map(([, html]) => ({
      html,
      first: i === 0 || !html.includes(", trwa "),
    })),
  );
  const firsts = rows.filter((r) => r.first).length;
  // /pogoda: per warning, highest first, its card with its tag and IMGW's
  // own words.
  const described = [
    ...weather.matchAll(
      /<h2 class="govuk-summary-card__title">Silny wiatr<\/h2>[\s\S]*?<strong class="govuk-tag govuk-tag--(?:yellow|orange|red)">Stopień ([1-3]) z 3<\/strong>[\s\S]*?<dd class="govuk-summary-list__value">Prognozuje się [^<]+ Prawdopodobieństwo: \d{1,3}%\.<\/dd>/g,
    ),
  ].map(([, level]) => Number(level));
  const imgwLinks =
    weather.split('<a href="https://meteo.imgw.pl/"').length - 1;
  const tags = hub.match(/<strong class="govuk-tag /g)?.length ?? 0;
  const weatherTags = weather.match(/<strong class="govuk-tag /g)?.length ?? 0;
  // As markup: the text alone is also in React's payload (its scripts).
  const brak =
    weather.split(`<p class="govuk-body">${NO_WARNINGS}</p>`).length - 1;
  const notice = (tag) =>
    new RegExp(
      `${tag}${NOTICE[state.notice]} Aktualne znajdziesz na <a href="https://meteo\\.imgw\\.pl/" class="govuk-link">meteo\\.imgw\\.pl</a>\\.`,
      "u",
    );
  const problems = [
    firsts !== n && `${firsts} warnings in the timeline, want ${n}`,
    ...rows.filter((r) => !row.test(r.html)).map((r) => `row ${r.html}`),
    tags !== rows.length && `${tags} tags on the page, want ${rows.length}`,
    /Prognozuje się|Prawdopodobieństwo/.test(hub) &&
      "IMGW's description on the address page",
    headings.join() !==
      "Najbliższe 7 dni,Wszystko o Twoim adresie,Skąd to wiemy" &&
      `headings ${headings}`,
    described.join() !== state.levels.join() &&
      `/pogoda describes ${described}, want ${state.levels}`,
    weatherTags !== n && `${weatherTags} tags on /pogoda, want ${n}`,
    imgwLinks !== (state.notice ? 2 : 1) &&
      `${imgwLinks} links to IMGW on /pogoda`,
    // The notice: in the hub's inset and first on /pogoda; none when fresh.
    (state.notice
      ? !notice(
          '<div class="govuk-inset-text">(?:(?!</div>)[\\s\\S])*<p class="govuk-body">',
        ).test(hub) ||
        !notice(
          '</p><div class="govuk-inset-text"><p class="govuk-body">',
        ).test(weather)
      : /[Nn]ie udało się[^<]*ostrzeżeń IMGW/.test(hub + weather)) &&
      "the notice",
    // „Brak ostrzeżeń” once, only fresh with none, only on /pogoda.
    brak !== (n === 0 && !state.notice ? 1 : 0) && `${brak} „Brak ostrzeżeń”`,
    hub.includes(NO_WARNINGS) && "„Brak ostrzeżeń” on the address page",
    waste.includes("Ostrzeżenie IMGW") && "a warning row on /smieci",
  ].filter(Boolean);
  if (problems.length > 0) failures.push(`${label}: ${problems.join("; ")}`);
  else console.log(`ok    ${label}: ${n} warnings, each once`);
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

// Tab (keyboard only) to the first link whose text starts with `text`:
// GOV.UK's focus style on it.
async function focusCheck(page, text, where) {
  let focused = null;
  for (let i = 0; i < 80 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate((start) => {
      const el = document.activeElement;
      if (!el?.textContent?.startsWith(start)) return null;
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

// Three warnings: axe, focus, tags, reflow.
async function deepChecks(browser, origin) {
  for (const target of [HUB, WEATHER])
    for (const width of WIDTHS) {
      const { context, page } = await open(browser, origin, width, 2, target);
      const { violations } = await new AxeBuilder({ page })
        .withTags(TAGS)
        .include("main")
        .analyze();
      for (const v of violations)
        failures.push(`${target} [${width}px]: axe ${v.id}: ${v.help}`);
      if (violations.length === 0)
        console.log(`ok    axe ${target} [${width}px]`);
      await context.close();
    }

  // IMGW's link on /pogoda; a timeline row's „Szczegóły” on the address
  // page, at both widths (the summary list's actions move under the value
  // on a phone).
  const weather = await open(browser, origin, 1280, 2, WEATHER);
  await focusCheck(weather.page, SOURCE, WEATHER);
  await weather.context.close();
  for (const width of WIDTHS) {
    const hub = await openHub(browser, origin, width);
    await focusCheck(
      hub.page,
      "Szczegóły o ostrzeżeniu IMGW",
      `${HUB} [${width}px]`,
    );
    await hub.context.close();
  }

  const { context, page } = await openHub(browser, origin, 1280);
  // The tags (in the timeline): IMGW's level colours, readable.
  const tags = await page.evaluate(() =>
    [...document.querySelectorAll("main .govuk-tag")].map((t) => {
      const s = getComputedStyle(t);
      return [t.className, s.color, s.backgroundColor];
    }),
  );
  // One per IMGW row: a warning that spans midnight has a row on each day.
  const rows = await page
    .locator("main .govuk-summary-list__key", { hasText: "Ostrzeżenie IMGW" })
    .count();
  if (rows < 3 || tags.length !== rows)
    failures.push(`${tags.length} tags, want one per IMGW row (${rows}, ≥ 3)`);
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
  for (const [width, scale, target] of [
    [320, 1, HUB],
    [640, 2, HUB],
    [320, 1, WEATHER],
    [640, 2, WEATHER],
  ]) {
    const narrow = await open(browser, origin, width, scale, target);
    const [scroll, client] = await narrow.page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    const label = `${target} ${scale === 2 ? "200% zoom (640 px)" : `${width} px`}`;
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
    for (const page of [HUB, WEATHER, `${HUB}/smieci`]) forget(page);
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
  for (const page of [HUB, WEATHER, `${HUB}/smieci`]) forget(page);
} finally {
  await closeRenderedPages();
  await browser.close();
}

finish(
  failures,
  `IMGW warnings: ${CI ? "mock:none and three warnings (--ci)" : `${STATES.length + 1} states`}, each once, only on the address page.`,
);
