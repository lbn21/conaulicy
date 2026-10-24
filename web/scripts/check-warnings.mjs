// The IMGW banner (components/imgw-banner.tsx) in every state, from the mock
// (IMGW_WARNINGS_URL=mock:…, lib/imgw-mock.ts), on the built site:
// - mock:none (the build's own setting in CI): no banner on any route;
// - each state on one address page, a server per state: GOV.UK's markup
//   (role="region", aria-labelledby, no role="alert", no button), the title,
//   one tag per warning with its level and colour, highest first, the time,
//   probability and footer sentences, the stale line, placed before the h1
//   in the two-thirds column; axe at 375 and 1280 px;
// - a level-3 warning on the home page and /ulice (placement before the h1);
// - stale (the copy kept from an earlier 10-minute slot), too old (3 hours)
//   and a failing IMGW: the server's clock runs ahead (lib/fake-clock.mjs);
// - three warnings: keyboard focus on the link, 320 px and 200% zoom with no
//   horizontal scroll, the tags' and title's contrast, the banner's paddings.
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
import { finish, ROUTES, startServer } from "./lib/server.mjs";

const ADDRESS = "/adres/0972447-00470";
const WIDTHS = [375, 1280];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MINUTE = 60_000;
const CLOCK = path.resolve(import.meta.dirname, "lib/fake-clock.mjs");
const SHOTS = process.env.SCREENSHOT_DIR;

// Kept by the stale states: fetched at the real time (the states before it
// take minutes), failing from 10 minutes on, before the stale server's clock
// (20 minutes ahead).
const KEPT = `mock:1809?level=2&failAfter=${new Date(Date.now() + 10 * MINUTE).toISOString()}`;

// levels: the tags expected, in order; upcoming: which items are to come.
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
      upcoming: [true],
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
    upcoming: [true],
    crossDay: true,
  },
  // Primes the kept copy (shown fresh), then the same copy 20 minutes and
  // over 3 hours on, with IMGW failing.
  { name: "kept-fresh", url: KEPT, levels: [2], shot: false },
  { name: "stale", url: KEPT, ahead: 20 * MINUTE, levels: [2], stale: true },
  { name: "too-old", url: KEPT, ahead: 195 * MINUTE, levels: null },
  { name: "failing", url: "mock:1809?fail=timeout", levels: null },
];

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
const CROSS_DAY = new RegExp(`^Od ${DAY}, ${TIME} do ${DAY}, ${TIME}\\.$`, "u");
const footer = (stale) =>
  new RegExp(
    `^Dotyczy całego powiatu lubaczowskiego\\. Stan na ${TIME}\\.${stale ? " Nowszych danych nie udało się pobrać\\." : ""} ${IMGW_ATTRIBUTION.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "u",
  );
const COLOUR = {
  1: "govuk-tag--yellow",
  2: "govuk-tag--orange",
  3: "govuk-tag--red",
};

const failures = [];
const shots = []; // [width, state, file]
let port = 3320;

// Drop a page from the ISR cache, so the next request renders it: the
// build's prerendered copy and any copy rendered since (route-cache).
function forget(page) {
  const name = page === "/" ? "index" : page.slice(1);
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
    items: [...b.querySelectorAll(".govuk-notification-banner__heading")].map(
      (h) => ({
        tagName: h.tagName,
        event: h.firstChild?.textContent.trim(),
        tag: h.querySelector(".govuk-tag")?.textContent,
        tagClass: h.querySelector(".govuk-tag")?.className,
        when: h.nextElementSibling?.textContent,
        details: h.nextElementSibling?.nextElementSibling?.textContent,
      }),
    ),
    link: [...b.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.textContent,
      a.className,
      a.target,
    ]),
    footer: b.querySelector(".govuk-body-s")?.textContent,
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
  const levels = seen.items.map((item) =>
    Number(/Stopień (\d) z 3/.exec(item.tag)?.[1]),
  );
  if (levels.join() !== state.levels.join())
    fail(`levels ${levels}, want ${state.levels}`);
  seen.items.forEach((item, i) => {
    const level = state.levels[i];
    if (item.tagName !== "H3") fail(`item ${i}: heading ${item.tagName}`);
    if (item.event !== "Silny wiatr") fail(`item ${i}: event ${item.event}`);
    if (item.tagClass !== `govuk-tag ${COLOUR[level]}`)
      fail(`item ${i}: tag ${item.tagClass}`);
    const when = !state.upcoming?.[i]
      ? ACTIVE
      : state.crossDay
        ? CROSS_DAY
        : SAME_DAY;
    if (!when.test(item.when)) fail(`item ${i}: time „${item.when}”`);
    if (!/^Prawdopodobieństwo: \d{1,3}%\. Prognozuje się /.test(item.details))
      fail(`item ${i}: details „${item.details}”`);
  });
  const links = JSON.stringify(seen.link);
  if (
    links !==
    JSON.stringify([
      [
        "https://meteo.imgw.pl/",
        "Szczegóły i mapa na meteo.imgw.pl",
        "govuk-notification-banner__link",
        "",
      ],
    ])
  )
    fail(`links ${links}`);
  if (!footer(!!state.stale).test(seen.footer)) fail(`footer „${seen.footer}”`);
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
  await page.goto(origin + ADDRESS);
  let focused = null;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a?.matches(".govuk-notification-banner__link")) return null;
      const s = getComputedStyle(a);
      return {
        background: s.backgroundColor,
        shadow: s.boxShadow,
        colour: s.color,
      };
    });
  }
  if (!focused) failures.push("focus: Tab never reached the banner link");
  else if (
    focused.background !== "rgb(255, 221, 0)" ||
    focused.shadow === "none"
  )
    failures.push(
      `focus: link not in GOV.UK's focus style ${JSON.stringify(focused)}`,
    );
  else
    console.log(
      `ok    focus on the link: background ${focused.background}, text ${focused.colour}, box-shadow ${focused.shadow}`,
    );
  if (focused && SHOTS) {
    const file = path.join(SHOTS, "1280-focus-link.png");
    await page.locator(".govuk-notification-banner").screenshot({ path: file });
    shots.push([1280, "focus-link", file]);
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
    await narrow.goto(origin + ADDRESS);
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

async function visit(browser, origin, state, pagePath, name) {
  const before = failures.length;
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const response = await page.goto(origin + pagePath, { waitUntil: "load" });
    const label = `${state.name} ${pagePath} [${width}px]`;
    if (response?.status() !== 200)
      failures.push(`${label}: HTTP ${response?.status()}`);
    expectBanner(label, state, await page.evaluate(readBanner));
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
      const html = await (await fetch(plain.origin + route.path)).text();
      if (/govuk-notification-banner|Ostrzeżeni[ea] IMGW/.test(html))
        failures.push(
          `${route.path}: a banner with ${process.env.IMGW_WARNINGS_URL}`,
        );
    }
    console.log(
      `ok    ${process.env.IMGW_WARNINGS_URL}: no banner on ${ROUTES.length} routes`,
    );
  } finally {
    await plain.stop();
  }

  for (const state of [...STATES, PLACEMENT]) {
    const pages = state.pages ?? [ADDRESS];
    for (const page of pages) forget(page);
    const env = { IMGW_WARNINGS_URL: state.url };
    if (state.ahead)
      Object.assign(env, {
        FAKE_CLOCK_OFFSET_MS: String(state.ahead),
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ""} --import=${CLOCK}`.trim(),
      });
    const server = await startServer(port++, env);
    try {
      for (const page of pages) {
        const name = state.pages
          ? `${page === "/" ? "home" : page.slice(1)}-${state.name}`
          : state.name;
        await visit(browser, server.origin, state, page, name);
      }
      if (state.name === "three-l1-l2-l3")
        await deepChecks(browser, server.origin);
    } finally {
      await server.stop();
    }
  }
  for (const page of [ADDRESS, ...PLACEMENT.pages]) forget(page);
  if (SHOTS) {
    await contactSheets(browser);
    writeFileSync(
      path.join(SHOTS, "index.txt"),
      `${shots.map(([, , f]) => f).join("\n")}\n`,
    );
  }
} finally {
  await browser.close();
}

finish(
  failures,
  `IMGW banner: ${STATES.length + 1} states, every page as expected.`,
);
