// The address page as a hub of modules (components/hub.tsx, lib/modules.ts)
// and the waste subpage (/adres/<id>/smieci), on the CI fixture with the
// build's IMGW setting (mock:none in CI; check-warnings.mjs covers warnings):
// - breadcrumbs (GOV.UK's, every item a link, the page itself left out):
//   the hub „Strona główna › <locality>” (a street's to its locality's
//   line on /ulice, #m-<SIMC>; a village part's to its village's line;
//   any other village's to the villages; a village names its gmina),
//   /smieci adds the address page; the street page's
//   error variants keep the hub's;
// - the hub: no caption (the locality is in its breadcrumbs), h1, „Zmień adres”, h2 „Co Cię czeka”, the waste card
//   first (h3 „Śmieci”, „Szczegóły – śmieci” to /smieci, ?nr= kept), its
//   rows (Najbliższy odbiór with an absolute date, Pojemniki, Źródło), no
//   calendar, PDF or IMGW banner, „Bez zapowiedzi” with the weather and its
//   source; headings h1 → h2 → h3 with no skips; the fixture's dates are
//   unverified: one short „Uwaga” sentence linking the gmina's schedule,
//   while /smieci keeps the full note;
// - a split street without a number: the card asks for it, linking /smieci;
//   with one, the card has its date; an unknown number keeps the street
//   page's error (GOV.UK's validation pattern);
// - /smieci: caption, h1 „Odbiór śmieci”, the calendar and the PDF;
// - a house number on a street with one schedule: both pages say, right
//   under the h1, that it changes nothing; never on a split street, a
//   village or without a number;
// - the weather has no subpage: /pogoda is a 404 (check-indexing.mjs reads
//   the whole 404 page).
//
// With SCREENSHOT_DIR, also saves both pages with ?nr=5 at 375 px for the
// reviewer, and logs the note's gaps to the h1 and to „Zmień adres”.
//
// Runs against `next start` on the current build and the CI fixture.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { sharedNumberNote, UNVERIFIED_NOTE } from "../lib/schedule-notes.ts";
import { finish, startServer } from "./lib/server.mjs";

const STREET = "/adres/0972447-00470";
const SPLIT = "/adres/0972447-90004";
const VILLAGE = "/adres/0606010";
const VILLAGE_STREET = "/adres/0606234-90007";
// ul. Wodna in Młodów, and Pilipy, a part of Młodów: both crumbs go to
// Młodów's line on /ulice; Holiki, a part of Dąbrowa (no streets), to
// Dąbrowa's (check-all-places.mjs checks their ids).
const MLODOW_STREET = "/adres/0606286-24550";
const VILLAGE_PART = "/adres/0606300";
const BARE_VILLAGE_PART = "/adres/0606027";
const MAIN = /<main[\s\S]*<\/main>/;
const DATE = String.raw`\p{L}+, \d{1,2} \p{L}+`;
const NOTE = sharedNumberNote({
  kind: "ulica",
  zoneId: "",
  nr: null,
  askNumber: false,
  givenNr: "12",
});

const server = await startServer(3312);
const failures = [];
const fail = (path, message) => failures.push(`${path}: ${message}`);

async function main(path) {
  const response = await fetch(`${server.origin}${path}`);
  const html = await response.text();
  return { status: response.status, main: MAIN.exec(html)?.[0] ?? "", html };
}

function headingsInOrder(path, html) {
  let last = 0;
  for (const [, level] of html.matchAll(/<h([1-6])[\s>]/g)) {
    if (Number(level) > last + 1) fail(path, `h${level} after h${last}`);
    last = Number(level);
  }
}

// GOV.UK's breadcrumbs as [href, text], or null for any item that is not
// one link.
function crumbs(html) {
  const list =
    /<nav class="govuk-breadcrumbs[^"]*" aria-label="[^"]+"><ol class="govuk-breadcrumbs__list">([\s\S]*?)<\/ol><\/nav>/.exec(
      html,
    )?.[1] ?? "";
  return [
    ...list.matchAll(
      /<li class="govuk-breadcrumbs__list-item">([\s\S]*?)<\/li>/g,
    ),
  ].map(
    ([, item]) =>
      /^<a class="govuk-breadcrumbs__link" href="([^"]+)">([^<]+)<\/a>$/
        .exec(item)
        ?.slice(1) ?? null,
  );
}

const HOME = ["/", "Strona główna"];
const TOWN = ["/ulice#m-0972447", "Lubaczów"];
const VILLAGES = (text) => ["/ulice#wsie-heading", text];
const GROUP = (simc, text) => [`/ulice#m-${simc}`, text];

function crumbsAre(path, html, want) {
  const got = crumbs(html);
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(
      path,
      `breadcrumbs ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
}

// The cards' titles, in order.
const cards = (html) =>
  [...html.matchAll(/<h3 class="govuk-summary-card__title">([^<]*)</g)].map(
    ([, title]) => title,
  );

try {
  // [address page, its waste subpage, the hub's breadcrumbs, the address
  // page's name in /smieci's, the links between them]: the number given
  // stays in both links; the name shows it only on a split street.
  for (const [path, waste, locality, name, links = [path, waste]] of [
    [STREET, `${STREET}/smieci`, TOWN, "ul. Adama Asnyka"],
    // The number changes nothing here, but both links keep it, so the note
    // stays on the way back.
    [`${STREET}?nr=12`, `${STREET}/smieci?nr=12`, TOWN, "ul. Adama Asnyka"],
    [VILLAGE, `${VILLAGE}/smieci`, VILLAGES("Gmina Lubaczów"), "Dąbrowa"],
    [
      VILLAGE_STREET,
      `${VILLAGE_STREET}/smieci`,
      GROUP("0606234", "Lisie Jamy"),
      "ul. Polna",
    ],
    [
      MLODOW_STREET,
      `${MLODOW_STREET}/smieci`,
      GROUP("0606286", "Młodów"),
      "ul. Wodna",
    ],
    [
      VILLAGE_PART,
      `${VILLAGE_PART}/smieci`,
      GROUP("0606286", "Młodów, gmina Lubaczów"),
      "Pilipy",
    ],
    [
      BARE_VILLAGE_PART,
      `${BARE_VILLAGE_PART}/smieci`,
      GROUP("0606010", "Dąbrowa, gmina Lubaczów"),
      "Holiki",
    ],
    [
      `${SPLIT}?nr=7a`,
      `${SPLIT}/smieci?nr=7a`,
      TOWN,
      "ul. Tadeusza Kościuszki 7a",
    ],
  ]) {
    const { status, main: hub, html } = await main(path);
    if (status !== 200) fail(path, `${status}, want 200`);
    crumbsAre(path, hub, [HOME, locality]);
    if (
      !/<\/nav><div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds"><h1 class="govuk-heading-l">[^<]+<\/h1>/.test(
        hub,
      )
    )
      fail(path, "not the breadcrumbs, then the h1 with no caption");
    if (!hub.includes(">Zmień adres<")) fail(path, "no „Zmień adres”");
    if (
      !hub.includes(
        '<h2 id="co-cie-czeka-heading" class="govuk-heading-m">Co Cię czeka</h2>',
      )
    )
      fail(path, "no h2 „Co Cię czeka”");
    if (cards(hub)[0] !== "Śmieci") fail(path, `cards ${cards(hub)}`);
    const action = `<a class="govuk-link" href="${links[1]}">Szczegóły<span class="govuk-visually-hidden"> – śmieci</span></a>`;
    if (!hub.includes(action))
      fail(path, `no „Szczegóły – śmieci” to ${links[1]}`);
    if (
      !new RegExp(
        `<dt class="govuk-summary-list__key">Najbliższy odbiór</dt><dd class="govuk-summary-list__value">${DATE}</dd>`,
        "u",
      ).test(hub)
    )
      fail(path, "no absolute next pickup date");
    for (const key of ["Pojemniki", "Źródło"]) {
      if (!hub.includes(`<dt class="govuk-summary-list__key">${key}</dt>`))
        fail(path, `no row ${key}`);
    }
    if (/\b(dziś|jutro|pojutrze)\b/i.test(hub)) fail(path, "a relative date");
    if (/href="\/ics\/|harmonogram\.pdf|Dodaj do kalendarza/.test(hub))
      fail(path, "a calendar or PDF link");
    if (/govuk-notification-banner/.test(hub)) fail(path, "the IMGW banner");
    if (
      !/<h2 id="bez-zapowiedzi-heading"[^>]*>Bez zapowiedzi<\/h2><p class="govuk-body">Pogoda: brak ostrzeżeń IMGW\. Źródło: <a href="https:\/\/meteo\.imgw\.pl\/" class="govuk-link">IMGW-PIB<\/a>, sprawdzono /.test(
        hub,
      )
    )
      fail(path, "no „Bez zapowiedzi” line for the weather");
    if (
      !/<dt class="govuk-summary-list__key">Uwaga<\/dt><dd class="govuk-summary-list__value">Daty odczytaliśmy automatycznie, sprawdź je w <a href="https:\/\/[^"]+" class="govuk-link">harmonogramie gminy<\/a>\.<\/dd>/.test(
        hub,
      ) ||
      hub.includes(UNVERIFIED_NOTE)
    )
      fail(path, "not the short „Uwaga” sentence");
    headingsInOrder(path, hub);
    // The note right under the h1, only for the street with one schedule.
    const note = path === `${STREET}?nr=12`;
    const underH1 = new RegExp(`</h1><p class="govuk-body">${NOTE}</p>`);
    if (note !== underH1.test(hub))
      fail(path, note ? "no note under the h1" : "a house-number note");
    if (!note && hub.includes("Harmonogram jest wspólny"))
      fail(path, "a house-number note");
    // The number the page does not need stays out of the title.
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    if (note && /\b12\b/.test(title)) fail(path, `title ${title}`);

    const sub = await main(waste);
    if (sub.status !== 200) fail(waste, `${sub.status}, want 200`);
    crumbsAre(waste, sub.main, [HOME, locality, [links[0], name]]);
    if (
      !/<span class="govuk-caption-l">[^<]+<\/span><h1 class="govuk-heading-l">Odbiór śmieci<\/h1>/.test(
        sub.main,
      )
    )
      fail(waste, "no caption and h1 „Odbiór śmieci”");
    if (
      !sub.main.includes('href="/ics/') ||
      !sub.main.includes("harmonogram.pdf")
    )
      fail(waste, "no calendar or PDF");
    if (!sub.main.includes('id="pickups-heading"')) fail(waste, "no pickups");
    if (!sub.main.includes(UNVERIFIED_NOTE)) fail(waste, "no unverified note");
    if (/govuk-notification-banner/.test(sub.main))
      fail(waste, "the IMGW banner");
    headingsInOrder(waste, sub.main);
    if (note !== underH1.test(sub.main))
      fail(waste, note ? "no note under the h1" : "a house-number note");
    if (!note && sub.main.includes("Harmonogram jest wspólny"))
      fail(waste, "a house-number note");
    const subTitle = /<title>([^<]*)<\/title>/.exec(sub.html)?.[1] ?? "";
    if (note && /\b12\b/.test(subTitle)) fail(waste, `title ${subTitle}`);
  }

  // A split street: the number first, then its dates; a wrong one keeps the
  // street page's error.
  const ask = await main(SPLIT);
  if (cards(ask.main)[0] !== "Śmieci") fail(SPLIT, "no waste card");
  if (
    !ask.main.includes(
      `<a href="${SPLIT}/smieci" class="govuk-link">Podaj numer domu</a>`,
    )
  )
    fail(SPLIT, "no „Podaj numer domu” to /smieci");
  if (ask.main.includes('href="/ics/')) fail(SPLIT, "a calendar link");
  crumbsAre(SPLIT, ask.main, [HOME, TOWN]);
  const wrong = await main(`${SPLIT}?nr=42`);
  if (
    !wrong.main.includes("govuk-error-summary") ||
    cards(wrong.main).length > 0
  )
    fail(`${SPLIT}?nr=42`, "not the street page's error");
  crumbsAre(`${SPLIT}?nr=42`, wrong.main, [HOME, TOWN]);
  const askSub = `${SPLIT}/smieci`;
  crumbsAre(askSub, (await main(askSub)).main, [
    HOME,
    TOWN,
    [SPLIT, "ul. Tadeusza Kościuszki"],
  ]);
  // A wrong number on a split street goes back with it (the hub's error);
  // no usable number (/numer) goes back without.
  crumbsAre(
    `${SPLIT}/smieci?nr=42`,
    (await main(`${SPLIT}/smieci?nr=42`)).main,
    [HOME, TOWN, [`${SPLIT}?nr=42`, "ul. Tadeusza Kościuszki"]],
  );
  for (const nr of ["", "x!"]) {
    const path = `${STREET}/smieci?nr=${nr}`;
    crumbsAre(path, (await main(path)).main, [
      HOME,
      TOWN,
      [STREET, "ul. Adama Asnyka"],
    ]);
  }
  // Never on a split street (asked, or a wrong number) or a village.
  for (const path of [
    SPLIT,
    `${SPLIT}?nr=42`,
    `${SPLIT}/smieci?nr=42`,
    `${VILLAGE}?nr=5`,
    `${VILLAGE}/smieci?nr=5`,
  ]) {
    if ((await main(path)).main.includes("Harmonogram jest wspólny"))
      fail(path, "a house-number note");
  }

  if (process.env.SCREENSHOT_DIR) await shots(process.env.SCREENSHOT_DIR);
} finally {
  server.stop();
}

/**
 * 375-<page>.png, the breadcrumbs' gap to what follows and their left edge
 * against the h1's, and with ?nr=5 the note's ink-free box gaps, in CSS px.
 */
async function shots(dir) {
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    for (const [name, url] of [
      ["hub", STREET],
      ["smieci", `${STREET}/smieci`],
      ["village-hub", VILLAGE],
      ["village-smieci", `${VILLAGE}/smieci`],
      ["hub-nr5", `${STREET}?nr=5`],
      ["smieci-nr5", `${STREET}/smieci?nr=5`],
    ]) {
      await page.goto(server.origin + url, { waitUntil: "load" });
      const gaps = await page.evaluate((note) => {
        const box = (selector) =>
          document.querySelector(selector).getBoundingClientRect();
        const crumbs = box("main .govuk-breadcrumbs");
        const next = box("main .govuk-grid-row");
        const h1 = box("main h1");
        const gaps = {
          crumbsToNext: next.top - crumbs.bottom,
          crumbsLeft: crumbs.left - h1.left,
        };
        if (!note) return gaps;
        const nr = box("main h1 + p");
        const change = box("main h1 + p + p");
        return {
          ...gaps,
          h1ToNote: nr.top - h1.bottom,
          noteToChange: change.top - nr.bottom,
          left: nr.left - h1.left,
        };
      }, name.endsWith("nr5"));
      console.log(`${url} [375px]: ${JSON.stringify(gaps)}`);
      await page.screenshot({
        path: path.join(dir, `375-${name}.png`),
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
  }
}

finish(
  failures,
  "Modules: the hub (waste card first, no calendar, weather under „Bez zapowiedzi”) and /smieci (breadcrumbs, h1, calendar, PDF).",
);
