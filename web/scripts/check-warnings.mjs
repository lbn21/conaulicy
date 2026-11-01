// The IMGW banner (components/imgw-banner.tsx) in every state, from the mock
// store (IMGW_WARNINGS_URL=mock:…, lib/imgw-mock.ts mockFiles: the files a
// good cron run left, checkedAgo minutes back), on the built site:
// - mock:none (the build's own setting in CI): no banner on any route, the
//   quiet line instead („Ostrzeżenia IMGW: brak ostrzeżeń … · sprawdziliśmy
//   14:52”) on the banner's pages, no warning on the address page; the
//   banner is a live block, read per request (components/live-block.tsx),
//   so every page is read as the browser shows it; the breadcrumbs only on
//   the address pages,
//   right before <main> (task 149), so nothing precedes the banner in it;
// - never the banner on an address page or its waste subpage: its
//   „Najbliższe dni” block (components/upcoming.tsx) and weather section
//   for one warning, two and three (a line each), stale and too old (the
//   notice in Pogoda);
// - each state on one page (/o-projekcie), a server per state: GOV.UK's markup
//   (role="region", aria-labelledby, no role="alert", no button), the title,
//   one tag per warning with its level and colour, highest first, the time,
//   the visible source line, the probability and footer sentences, the
//   notice and its link, placed first in <main> and before the h1 in the
//   two-thirds column; axe at 375 and 1280 px;
// - a level-3 warning on the home page and /ulice (placement before the h1);
// - stale (the last good check over an hour back: the notice, the warning
//   still listed; with no warning, the notice alone), too old (3 hours: the
//   notice alone) and a store that cannot be read (the notice alone on the
//   banner's pages and the hub's Pogoda; every page renders as
//   ever, the 404 page with no banner at all);
// - three warnings: keyboard focus on the link, 320 px and 200% zoom with no
//   horizontal scroll, the tags' fills (IMGW's level colours, lib/palette.ts)
//   and contrast, the title's contrast, the banner's paddings.
// Each state's pages are dropped from the ISR cache first, so they render
// with that server's setting. With SCREENSHOT_DIR, saves <width>-<state>.png
// (DPR 2) and one contact sheet per width. Run after `next build`.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { IMGW_ATTRIBUTION } from "../lib/imgw-warnings.ts";
import { WARNING_LEVELS } from "../lib/palette.ts";
import {
  closeRenderedPages,
  finish,
  ROUTES,
  renderedPage,
  startServer,
  withoutReactMarks,
} from "./lib/server.mjs";

// The banner's page for every state: any page but an address page, which
// carries the warnings in „Najbliższe dni” instead (HUB, below).
const PAGE = "/o-projekcie";
const HUB = "/adres/0972447-00470";
// The hub's weather section with no warning (lib/weather-module.ts).
const NO_WARNINGS = "Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.";
const WIDTHS = [375, 1280];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SHOTS = process.env.SCREENSHOT_DIR;

// levels: the tags expected, in order (null: no banner); upcoming: which
// items are to come; notice: the notice expected first; opened: also checked
// and shot with the details open.
const STATES = [
  ...[1, 2, 3].flatMap((level) => [
    {
      name: `l${level}-active`,
      url: `mock:1809?level=${level}`,
      levels: [level],
      opened: level === 3,
      ...(level === 1 && { hub: 1 }),
    },
    {
      name: `l${level}-upcoming`,
      url: `mock:1809?level=${level}&start=upcoming`,
      levels: [level],
      upcoming: [true],
    },
  ]),
  {
    name: "two-l2-l3",
    url: "mock:1809?level=2&also=3",
    levels: [3, 2],
    hub: 2,
  },
  {
    name: "three-l1-l2-l3",
    url: "mock:1809?level=1&also=2,3",
    levels: [3, 2, 1],
    opened: true,
    hub: 3,
  },
  {
    name: "cross-day-upcoming",
    url: "mock:1809?level=2&start=night",
    levels: [2],
    upcoming: [true],
    crossDay: true,
  },
  // The last good check over an hour back, and over three hours.
  {
    name: "stale",
    url: "mock:1809?level=2&checkedAgo=70",
    levels: [2],
    notice: "stale",
    hub: 1,
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
    hub: 0,
  },
];

// The store cannot be read: an expected error, rendered as a notice.
const UNREADABLE = {
  name: "unreadable",
  url: "mock:1809?fail=500",
  levels: [],
  notice: "unreadable",
  hub: 0,
  pages: [PAGE, "/ulice"],
};
// A 404, never with the banner (app/not-found.tsx).
const NOT_FOUND = "/nie-ma-takiej-strony";

// Home and /ulice, with the state's server.
const PLACEMENT = {
  name: "l3-active",
  url: "mock:1809?level=3",
  levels: [3],
  pages: ["/", "/ulice"],
};

const DAY =
  "(?:niedzieli|poniedziałku|wtorku|środy|czwartku|piątku|soboty) \\d{1,2} \\p{L}+";
const TIME = "\\d{1,2}:\\d{2}";
const ACTIVE = new RegExp(`^Obowiązuje teraz, do ${DAY}, ${TIME}\\.$`, "u");
const SAME_DAY = new RegExp(`^Od ${DAY}, ${TIME} do ${TIME}\\.$`, "u");
const SHORT_TO = new RegExp(`^do ${DAY}, ${TIME}$`, "u");
const SHORT_FROM = new RegExp(`^od ${DAY}, ${TIME}$`, "u");
const CROSS_DAY = new RegExp(`^Od ${DAY}, ${TIME} do ${DAY}, ${TIME}\\.$`, "u");
const FOOTER = new RegExp(
  `^Dotyczy całego powiatu lubaczowskiego\\. Stan na ${TIME}\\.$`,
  "u",
);
// The last data's time: its day too when not today.
const SINCE = `(?:${DAY}, )?${TIME}`;
const CURRENT = " Aktualne znajdziesz na meteo\\.imgw\\.pl\\.";
const NOTICE = {
  stale: `Nie udało się teraz pobrać ostrzeżeń IMGW\\. Pokazujemy ostatnie dane z ${SINCE}\\.`,
  "stale-none": `Nie udało się teraz pobrać ostrzeżeń IMGW\\. Ostatnie dane mamy z ${SINCE}\\.`,
  "too-old": `Od ${SINCE} nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy\\.`,
  unreadable: "Nie udało się teraz sprawdzić ostrzeżeń IMGW\\.",
};
const notice = (name) => new RegExp(`^${NOTICE[name]}${CURRENT}$`, "u");
const NOTICE_LINK = [
  "https://meteo.imgw.pl/",
  "meteo.imgw.pl",
  "govuk-notification-banner__link",
  "",
];
const DETAILS_LINK = [
  "https://meteo.imgw.pl/",
  "Szczegóły i mapa na meteo.imgw.pl",
  "govuk-notification-banner__link",
  "",
];
const COLOUR = {
  1: "govuk-tag--yellow",
  2: "govuk-tag--orange",
  3: "govuk-tag--red",
};

const failures = [];
const shots = []; // [width, state, file]
let port = 3320;

// Drop a page from the ISR cache, so the next request renders it: the
// build's prerendered copy and any copy rendered since (route-cache). Cached
// by its path, never its query.
function forget(page) {
  const name = page === "/" ? "index" : page.slice(1).split("?")[0];
  const routeCache = ".next/server/route-cache/APP_PAGE";
  const bases = [
    path.join(".next/server/app", name),
    ...(existsSync(routeCache) ? readdirSync(routeCache) : []).map((build) =>
      path.join(routeCache, build, "$", page === "/" ? "index" : name),
    ),
  ];
  for (const base of bases)
    for (const ext of [".html", ".rsc", ".meta", ".segments"])
      rmSync(base + ext, { recursive: true, force: true });
}

// GOV.UK's breadcrumbs only on an address page (none on a flat site, the
// home page or a 404), before <main>, as GOV.UK places them: the skip link
// skips them and nothing stands above the banner in <main> (task 149). Read
// without React's marks: the @breadcrumbs slot
// (app/layout.tsx) is a boundary of its own, and so are an address page's
// breadcrumbs (task 231).
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

// What the page shows of the banner, or null.
function readBanner() {
  const banners = [...document.querySelectorAll(".govuk-notification-banner")];
  if (banners.length === 0) return null;
  const [b] = banners;
  const title = document.getElementById(b.getAttribute("aria-labelledby"));
  const h1 = document.querySelector("main h1");
  const row = b.closest(".govuk-grid-row");
  return {
    count: banners.length,
    height: b.getBoundingClientRect().height,
    role: b.getAttribute("role"),
    titleTag: title?.tagName,
    title: title?.textContent.trim(),
    inHeader: !!title?.closest(".govuk-notification-banner__header"),
    firstInMain:
      row?.parentElement?.id === "main-content" && !row.previousElementSibling,
    column: !!b.closest(".govuk-grid-column-two-thirds"),
    beforeH1:
      !!h1 &&
      !!(b.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING),
    // Only the error summary, the h1's caption and scripts (the home page's
    // JSON-LD) may stand between the banner and the h1.
    between: [...(row?.nextElementSibling?.querySelectorAll("*") ?? [])]
      .slice(
        0,
        [...(row?.nextElementSibling?.querySelectorAll("*") ?? [])].indexOf(h1),
      )
      .filter(
        (el) =>
          !el.closest(".govuk-error-summary") &&
          !el.matches("[class^=govuk-caption-], script") &&
          !el.contains(h1),
      )
      .map((el) => el.tagName),
    list: b.querySelectorAll(
      ":scope .govuk-notification-banner__content > ul.govuk-list > li",
    ).length,
    // The content: the visible lines (a paragraph, or a list), then the
    // details.
    content: [
      ...b.querySelector(".govuk-notification-banner__content").children,
    ].map((el) => `${el.tagName}.${el.className}`),
    // The notice: the content's paragraph with a link.
    notice: b
      .querySelector(
        ".govuk-notification-banner__content > p.govuk-body:has(a)",
      )
      ?.textContent.replace(/\s+/g, " ")
      .trim(),
    lines: [
      ...b.querySelectorAll(
        ".govuk-notification-banner__content > p.govuk-body:not(:has(a)), .govuk-notification-banner__content > ul > li",
      ),
    ].map((line) => {
      const [event, tag] = line.querySelectorAll("strong");
      return {
        event: event?.textContent,
        tag: tag?.textContent,
        tagClass: tag?.className,
        short: line.lastChild?.textContent.trim(),
      };
    }),
    open: b.querySelector("details.govuk-details")?.open,
    summary: b
      .querySelector(".govuk-details__summary-text")
      ?.textContent.trim(),
    headings: [...b.querySelectorAll(".govuk-details__text > h3")].map(
      (h) => h.textContent,
    ),
    sentences: [
      ...b.querySelectorAll(".govuk-details__text > p.govuk-body:not(:has(a))"),
    ].map((p) => p.textContent),
    link: [...b.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.textContent,
      a.className,
      a.target,
    ]),
    source: b.querySelector(
      ".govuk-notification-banner__content > p.govuk-body-s",
    )?.textContent,
    footer: b.querySelector(".govuk-details__text > .govuk-body-s")
      ?.textContent,
    attribution: b.querySelector(".govuk-details__text > .govuk-hint")
      ?.textContent,
    alerts:
      b.querySelectorAll('[role="alert"]').length +
      (b.getAttribute("role") === "alert" ? 1 : 0),
    buttons: b.querySelectorAll("button").length,
  };
}

function expectBanner(label, state, seen) {
  const fail = (what) => failures.push(`${label}: ${what}`);
  if (!state.levels) {
    if (seen) fail(`a banner (${seen.title}), want none`);
    return;
  }
  if (!seen) return fail("no banner");
  const n = state.levels.length;
  if (seen.count !== 1) fail(`${seen.count} banners`);
  if (seen.role !== "region") fail(`role ${seen.role}`);
  if (seen.alerts || seen.buttons) fail("role=alert or a button");
  if (seen.titleTag !== "H2" || !seen.inHeader)
    fail("title is not the header's h2");
  if (seen.title !== (n === 1 ? "Ostrzeżenie IMGW" : "Ostrzeżenia IMGW"))
    fail(`title ${seen.title}`);
  if (
    !seen.firstInMain ||
    !seen.column ||
    !seen.beforeH1 ||
    seen.between.length
  )
    fail(
      `placement: first in main ${seen.firstInMain}, two-thirds ${seen.column}, before h1 ${seen.beforeH1}, between ${seen.between}`,
    );
  if (seen.list !== (n > 1 ? n : 0))
    fail(`${seen.list} list items for ${n} warnings`);
  const content = [
    ...(state.notice ? ["P.govuk-body"] : []),
    ...(n === 0
      ? []
      : [
          n > 1 ? "UL.govuk-list" : "P.govuk-body",
          "P.govuk-body-s",
          "DETAILS.govuk-details",
        ]),
  ];
  if (seen.content.join() !== content.join())
    fail(`content ${seen.content}, want ${content}`);
  if (state.notice ? !notice(state.notice).test(seen.notice) : seen.notice)
    fail(`notice „${seen.notice}”`);
  const links = JSON.stringify(seen.link);
  const want = [
    ...(state.notice ? [NOTICE_LINK] : []),
    ...(n > 0 ? [DETAILS_LINK] : []),
  ];
  if (links !== JSON.stringify(want)) fail(`links ${links}`);
  // The notice alone: no source line or details (nothing of IMGW's shown).
  if (n === 0) return;
  if (seen.open !== false) fail("details not closed");
  if (
    seen.summary !== (n === 1 ? "Szczegóły ostrzeżenia" : "Szczegóły ostrzeżeń")
  )
    fail(`summary „${seen.summary}”`);
  const levels = seen.lines.map((line) =>
    Number(/^Stopień (\d) z 3$/.exec(line.tag)?.[1]),
  );
  if (levels.join() !== state.levels.join())
    fail(`levels ${levels}, want ${state.levels}`);
  const headings =
    n > 1 ? levels.map((l) => `Silny wiatr – Stopień ${l} z 3`) : [];
  if (seen.headings.join("|") !== headings.join("|"))
    fail(`details headings ${seen.headings}`);
  if (seen.sentences.length !== 2 * n)
    fail(`${seen.sentences.length} sentences in the details for ${n}`);
  seen.lines.forEach((line, i) => {
    const level = state.levels[i];
    const upcoming = state.upcoming?.[i];
    if (line.event !== "Silny wiatr") fail(`line ${i}: event ${line.event}`);
    if (line.tagClass !== `govuk-tag ${COLOUR[level]}`)
      fail(`line ${i}: tag ${line.tagClass}`);
    if (!(upcoming ? SHORT_FROM : SHORT_TO).test(line.short))
      fail(`line ${i}: time „${line.short}”`);
    const when = !upcoming ? ACTIVE : state.crossDay ? CROSS_DAY : SAME_DAY;
    const [sentence, details] = seen.sentences.slice(2 * i, 2 * i + 2);
    if (!when.test(sentence)) fail(`warning ${i}: time „${sentence}”`);
    if (!/^Prawdopodobieństwo: \d{1,3}%\. Prognozuje się /.test(details))
      fail(`warning ${i}: details „${details}”`);
  });
  if (seen.source !== "Źródło: IMGW-PIB") fail(`source „${seen.source}”`);
  if (!FOOTER.test(seen.footer)) fail(`footer „${seen.footer}”`);
  // IMGW's wording as is, in secondary text (task 205).
  if (seen.attribution !== IMGW_ATTRIBUTION.join(" "))
    fail(`attribution „${seen.attribution}”`);
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

// Three warnings: focus, reflow, contrast, paddings.
async function deepChecks(browser, origin) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(origin + PAGE);
  // Tab to the summary (keyboard only), open it with Enter, Tab to the link.
  for (const [what, selector] of [
    ["summary", ".govuk-details__summary"],
    ["link", ".govuk-notification-banner__link"],
  ]) {
    let focused = null;
    for (let i = 0; i < 40 && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate((sel) => {
        const el = document.activeElement;
        if (!el?.matches(sel)) return null;
        // GOV.UK's focus style: the summary's on its text span.
        const s = getComputedStyle(
          el.querySelector(".govuk-details__summary-text") ?? el,
        );
        const own = getComputedStyle(el);
        return {
          background: [s.backgroundColor, own.backgroundColor].find(
            (c) => c === "rgb(255, 221, 0)",
          ),
          shadow: [s.boxShadow, own.boxShadow].find((c) => c !== "none"),
          outline: own.outlineStyle,
        };
      }, selector);
    }
    if (!focused) failures.push(`focus: Tab never reached the ${what}`);
    else if (!focused.background || !focused.shadow)
      failures.push(
        `focus: ${what} not in GOV.UK's focus style ${JSON.stringify(focused)}`,
      );
    else
      console.log(
        `ok    focus on the ${what}: background ${focused.background}, box-shadow ${focused.shadow}`,
      );
    if (focused && SHOTS) {
      const file = path.join(SHOTS, `1280-focus-${what}.png`);
      await page
        .locator(".govuk-notification-banner")
        .screenshot({ path: file });
      shots.push([1280, `focus-${what}`, file]);
    }
    if (what === "summary") {
      await page.keyboard.press("Enter");
      const open = await page.evaluate(
        () => document.querySelector(".govuk-notification-banner details").open,
      );
      if (!open)
        failures.push("keyboard: Enter on the summary does not open it");
    }
  }

  const colours = await page.evaluate(() => {
    const b = document.querySelector(".govuk-notification-banner");
    const header = b.querySelector(".govuk-notification-banner__header");
    const content = b.querySelector(".govuk-notification-banner__content");
    const s = (el) => getComputedStyle(el);
    const px = (el, side) => Number.parseFloat(s(el)[`padding${side}`]);
    return {
      border: s(b).borderTopColor,
      borderWidth: s(b).borderTopWidth,
      header: s(header).backgroundColor,
      title: s(b.querySelector(".govuk-notification-banner__title")).color,
      content: s(content).backgroundColor,
      tags: [...b.querySelectorAll(".govuk-tag")].map((t) => [
        t.className,
        s(t).color,
        s(t).backgroundColor,
      ]),
      header_pad: ["Top", "Right", "Bottom", "Left"].map((d) => px(header, d)),
      content_pad: ["Top", "Right", "Bottom", "Left"].map((d) =>
        px(content, d),
      ),
    };
  });
  const rows = [
    ["title (inverse-text) on brand", colours.title, colours.header, 4.5],
    ...colours.tags.map(([cls, fg, bg]) => [
      `${cls.split("--")[1]} tag text on its background`,
      fg,
      bg,
      4.5,
    ]),
    ...colours.tags.map(([cls, , bg]) => [
      `${cls.split("--")[1]} tag background vs banner content background`,
      bg,
      colours.content,
      0,
    ]),
    ...colours.tags.map(([cls, , bg]) => [
      `${cls.split("--")[1]} tag background vs banner border (brand)`,
      bg,
      colours.border,
      0,
    ]),
    [
      "banner border (brand) vs content background",
      colours.border,
      colours.content,
      3,
    ],
  ];
  console.log(
    "\n| Pair | Foreground | Background | Ratio | Needs |\n| --- | --- | --- | ---: | --- |",
  );
  for (const [name, fg, bg, min] of rows) {
    const r = ratio(fg, bg);
    console.log(
      `| ${name} | ${fg} | ${bg} | ${r.toFixed(2)} | ${min ? `${min}:1` : "info"} |`,
    );
    if (min && r < min)
      failures.push(`contrast: ${name} ${r.toFixed(2)} < ${min}`);
  }
  // The tags' fills are IMGW's level colours (WARNING_LEVELS).
  const rgb = (hex) =>
    `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  for (const [cls, , bg] of colours.tags) {
    const level = Object.keys(COLOUR).find((l) => cls.includes(COLOUR[l]));
    const want = rgb(WARNING_LEVELS[`warning-level-${level}`]);
    if (bg !== want)
      failures.push(`tag ${cls}: background ${bg}, want ${want} (IMGW)`);
  }
  const [ht, hr, hb, hl] = colours.header_pad;
  const [ct, cr, cb, cl] = colours.content_pad;
  console.log(
    `\nPaddings at 1280 px (CSS px): border ${colours.borderWidth}; header ${ht}/${hr}/${hb}/${hl}, content ${ct}/${cr}/${cb}/${cl} (top/right/bottom/left)`,
  );
  if (cl !== cr || ct !== cb || hl !== cl || hr !== cr)
    failures.push(
      "paddings: content not symmetric, or title not aligned with content",
    );
  if (ht !== hb)
    console.log(
      `note  GOV.UK's header is deliberately asymmetric: ${ht} px above the title, ${hb} px below (govuk-frontend, kept as-is)`,
    );

  // Reflow: 320 px, and 1280 px at 200% zoom (a 640 px viewport at DPR 2).
  for (const [width, scale] of [
    [320, 1],
    [640, 2],
  ]) {
    const narrow = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: scale,
    });
    await narrow.goto(origin + PAGE);
    const [scroll, client] = await narrow.evaluate(() => [
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
    await narrow.close();
  }
  await page.close();
}

// The address page with the state's warnings (state.hub: how many, all in
// force): never the banner, on it or its waste subpage; „Najbliższe dni”
// (components/upcoming.tsx), a line per warning (its day lead, the event, its
// tag, until when, „Cały powiat.”, „Szczegóły i źródło” to #pogoda), none
// on /smieci; the weather's section after the waste's, the state's notice
// first if any (its link IMGW's page), a tag and an absolute time per
// warning (its day lead the island's), never a relative word in it.
async function hubChecks(origin, state) {
  const label = `${state.name} ${HUB}`;
  const [hub, waste] = await Promise.all(
    [HUB, `${HUB}/smieci`].map(async (p) => {
      const { status, html } = await renderedPage(origin + p);
      if (status !== 200) failures.push(`${state.name} ${p}: HTTP ${status}`);
      return html;
    }),
  );
  for (const [p, html] of [
    [HUB, hub],
    [`${HUB}/smieci`, waste],
  ]) {
    if (html.includes('<div class="govuk-notification-banner"'))
      failures.push(`${state.name} ${p}: the IMGW banner`);
  }
  if (waste.includes("ostrzeżenie IMGW"))
    failures.push(`${state.name} ${HUB}/smieci: a warning line`);
  const cards = [
    ...hub.matchAll(
      /<section id="([a-z]+)" aria-labelledby="\1-heading"><h2 id="\1-heading" class="govuk-heading-l">([^<]*)</g,
    ),
  ].map(([, , title]) => title);
  const lines = [
    ...hub.matchAll(
      /<li><span class="govuk-!-display-block">([\s\S]*?)<\/li>/g,
    ),
  ]
    .map(([, line]) => line)
    .filter((line) => line.includes("ostrzeżenie IMGW"));
  const line = new RegExp(
    // The lead: the device's „Dziś”, „Jutro” or the start's date, absolute.
    `^<strong>(?:(?:Dziś|Jutro)(?: od ${TIME})?|\\p{Lu}\\p{L}+, \\d{1,2} \\p{L}+(?:, od ${TIME})?):</strong> ostrzeżenie IMGW – silny wiatr <strong class="govuk-tag govuk-tag--(?:yellow|orange|red)">Stopień [1-3] z 3</strong>, do (?:${DAY}, )?${TIME}\\.</span><span class="govuk-!-display-block">Cały powiat\\.</span><a class="govuk-link" href="#pogoda">Szczegóły i źródło<span class="govuk-visually-hidden">: pogoda</span></a>$`,
    "u",
  );
  const from = hub.indexOf('<section id="pogoda"');
  const section = hub.slice(from, hub.indexOf("</section>", from));
  const tags = section.match(/<strong class="govuk-tag /g)?.length ?? 0;
  const when = new RegExp(
    `<p class="govuk-body govuk-!-margin-bottom-2">(?:(?:Dziś|Jutro|Za [2-7] dni): \\p{Ll}|\\p{Lu})\\p{L}+, \\d{1,2} \\p{L}+, ${TIME}(?:–${TIME}| – \\p{L}+, \\d{1,2} \\p{L}+, ${TIME})</p>`,
    "gu",
  );
  const problems = [
    lines.length !== state.hub &&
      `${lines.length} warning lines, want ${state.hub}`,
    ...lines.filter((l) => !line.test(l)).map((l) => `line ${l}`),
    tags !== state.hub && `${tags} tags in Pogoda, want ${state.hub}`,
    (section.match(when)?.length ?? 0) !== state.hub &&
      "Pogoda without an absolute time per warning",
    /Obowiązuje teraz|Teraz/.test(section) && "a relative word in Pogoda",
    cards.join() !== "Śmieci,Woda,Pogoda" && `sections ${cards}`,
    // The notice first, with IMGW's link; none when fresh.
    (state.notice
      ? !new RegExp(
          `<h2 id="pogoda-heading" class="govuk-heading-l">Pogoda</h2><p class="govuk-body">${NOTICE[state.notice]} Aktualne znajdziesz na <a href="https://meteo\\.imgw\\.pl/" class="govuk-link">meteo\\.imgw\\.pl</a>\\.</p>`,
          "u",
        ).test(section)
      : section.includes("nie udało się")) && "Pogoda's notice",
    // Every section, always (task 207); the weather's says the warning.
    hub.includes(NO_WARNINGS) && "„Brak ostrzeżeń” with a warning",
  ].filter(Boolean);
  if (problems.length > 0) failures.push(`${label}: ${problems.join("; ")}`);
  else console.log(`ok    ${label}: „Najbliższe dni”, ${lines.length} lines`);
}

// With SCREENSHOT_DIR, the address page at 375 px for the reviewer:
// 375-hub-<state>.png (outside the banner's contact sheets).
async function hubShot(browser, origin, name) {
  if (!SHOTS) return;
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(origin + HUB, { waitUntil: "load" });
  await page.screenshot({
    path: path.join(SHOTS, `375-hub-${name}.png`),
    fullPage: true,
  });
  await context.close();
}

async function visit(browser, origin, state, pagePath, name) {
  const before = failures.length;
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const response = await page.goto(origin + pagePath, { waitUntil: "load" });
    // The banner comes in after the shell.
    await page
      .waitForFunction(
        () =>
          !document.querySelector(".app-skeleton") &&
          document.querySelector("main h1"),
        null,
        { timeout: 10_000 },
      )
      .catch(() => {});
    const label = `${state.name} ${pagePath} [${width}px]`;
    if (response?.status() !== 200)
      failures.push(`${label}: HTTP ${response?.status()}`);
    const seen = await page.evaluate(readBanner);
    expectBanner(label, state, seen);
    if (seen && width === 375)
      console.log(
        `height ${state.name} ${pagePath} [375px]: ${seen.height} px`,
      );
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include(".govuk-notification-banner, main h1")
      .analyze();
    for (const v of violations)
      failures.push(`${label}: axe ${v.id}: ${v.help}`);
    if (SHOTS && state.shot !== false && state.levels) {
      const file = path.join(SHOTS, `${width}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push([width, name, file]);
    }
    if (state.opened && !state.pages) {
      await page.click(".govuk-details__summary");
      const open = await page.evaluate(
        () => document.querySelector(".govuk-notification-banner details").open,
      );
      if (!open)
        failures.push(`${label}: the summary does not open the details`);
      const opened = await new AxeBuilder({ page })
        .withTags(TAGS)
        .include(".govuk-notification-banner")
        .analyze();
      for (const v of opened.violations)
        failures.push(`${label} (open): axe ${v.id}: ${v.help}`);
      if (SHOTS) {
        const file = path.join(SHOTS, `${width}-${name}-open.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push([width, `${name}-open`, file]);
      }
    }
    await context.close();
  }
  if (failures.length === before)
    console.log(`ok    ${state.name} ${pagePath}`);
  else
    console.log(
      failures
        .slice(before)
        .map((f) => `FAIL  ${f}`)
        .join("\n"),
    );
}

// One labelled grid per width: the top of each page (banner and h1).
async function contactSheets(browser) {
  for (const width of WIDTHS) {
    const own = shots.filter(([w]) => w === width);
    const columns = width === 375 ? 5 : 3;
    const cell = width === 375 ? 300 : 560;
    const figures = own
      .map(([, name, file]) => {
        const src = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
        return `<figure><figcaption>${name}</figcaption><div><img src="${src}"></div></figure>`;
      })
      .join("");
    const page = await browser.newPage({
      viewport: { width: columns * (cell + 16) + 16, height: 600 },
    });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:8px;font:600 15px system-ui;display:grid;grid-template-columns:repeat(${columns},${cell}px);gap:16px 16px;background:#fff}
      figure{margin:0}figcaption{padding:4px 0}
      div{height:${Math.round(cell * 1.6)}px;overflow:hidden;outline:1px solid #999}
      img{width:100%;display:block}</style>
      <body>${figures}</body>`);
    const file = path.join(SHOTS, `contact-sheet-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`Contact sheet: ${file} (${own.length} states)`);
    await page.close();
  }
}

const browser = await chromium.launch();
try {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  // The build as it is (CI: mock:none): no banner anywhere.
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
      // The banner's pages: the quiet line; the address pages: neither.
      const quiet =
        /<a class="govuk-link" href="https:\/\/meteo\.imgw\.pl\/">Ostrzeżenia IMGW<\/a>: brak ostrzeżeń dla powiatu lubaczowskiego · sprawdziliśmy \d{1,2}:\d{2}<\/p>/.test(
          shown,
        );
      if (
        /govuk-notification-banner/.test(shown) ||
        quiet === route.path.startsWith("/adres/")
      )
        failures.push(
          `${route.path}: a banner, or the quiet line ${quiet}, with ${process.env.IMGW_WARNINGS_URL}`,
        );
    }
    const hub = (await renderedPage(plain.origin + HUB)).html;
    if (
      hub.includes("ostrzeżenie IMGW") ||
      !hub.includes(`<p class="govuk-body">${NO_WARNINGS}</p>`)
    )
      failures.push(`${HUB}: a warning line, or no „${NO_WARNINGS}”`);
    await hubShot(browser, plain.origin, "none");
    console.log(
      `ok    ${process.env.IMGW_WARNINGS_URL}: no banner on ${ROUTES.length} routes, the quiet line on the banner's pages, no warning on ${HUB}`,
    );
  } finally {
    await plain.stop();
  }

  for (const state of [...STATES, UNREADABLE, PLACEMENT]) {
    const pages = state.pages ?? [PAGE];
    for (const page of [...pages, HUB, `${HUB}/smieci`]) forget(page);
    const server = await startServer(port++, { IMGW_WARNINGS_URL: state.url });
    try {
      for (const page of pages) {
        // A file name: the path's query as plain characters.
        const name = state.pages
          ? `${page === "/" ? "home" : page.slice(1).replace(/[^\w-]+/g, "-")}-${state.name}`
          : state.name;
        await visit(browser, server.origin, state, page, name);
      }
      if (state.name === "three-l1-l2-l3")
        await deepChecks(browser, server.origin);
      if (state.hub !== undefined) {
        await hubChecks(server.origin, state);
        await hubShot(browser, server.origin, state.name);
      }
    } finally {
      await server.stop();
    }
  }
  // The store unreadable: the 404 page as ever, with no banner.
  const unreadable = await startServer(port++, {
    IMGW_WARNINGS_URL: UNREADABLE.url,
  });
  try {
    const response = await fetch(unreadable.origin + NOT_FOUND);
    const html = await response.text();
    if (response.status !== 404 || html.includes("govuk-notification-banner"))
      failures.push(
        `${UNREADABLE.name} ${NOT_FOUND}: HTTP ${response.status} (want 404), or a banner`,
      );
    else
      console.log(`ok    ${UNREADABLE.name} ${NOT_FOUND}: HTTP 404, no banner`);
  } finally {
    await unreadable.stop();
  }
  for (const page of [PAGE, HUB, `${HUB}/smieci`, ...PLACEMENT.pages])
    forget(page);
  if (SHOTS) {
    await contactSheets(browser);
    writeFileSync(
      path.join(SHOTS, "index.txt"),
      `${shots.map(([, , f]) => f).join("\n")}\n`,
    );
  }
} finally {
  await closeRenderedPages();
  await browser.close();
}

finish(
  failures,
  `IMGW banner: ${STATES.length + 2} states, every page as expected.`,
);
