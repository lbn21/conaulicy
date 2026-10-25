// The address page as a hub of modules (components/hub.tsx, lib/modules.ts)
// and the waste subpage (/adres/<id>/smieci), on the CI fixture with the
// build's IMGW setting (mock:none in CI; check-warnings.mjs covers warnings):
// - the hub: caption, h1, „Zmień adres”, h2 „Co Cię czeka”, the waste card
//   first (h3 „Śmieci”, „Szczegóły – śmieci” to /smieci, ?nr= kept), its
//   rows (Najbliższy odbiór with an absolute date, Pojemniki, Źródło), no
//   calendar, PDF or IMGW banner, „Bez zapowiedzi” with the weather and its
//   source; headings h1 → h2 → h3 with no skips; the fixture's dates are
//   unverified: one short „Uwaga” sentence linking the gmina's schedule,
//   while /smieci keeps the full note;
// - a split street without a number: the card asks for it, linking /smieci;
//   with one, the card has its date; an unknown number keeps the street
//   page's error (GOV.UK's validation pattern);
// - /smieci: GOV.UK breadcrumbs (locality as text on a street, the address
//   page linked, „Odbiór śmieci” aria-current, no link; two levels for a
//   village), caption, h1 „Odbiór śmieci”, the calendar and the PDF;
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

// The cards' titles, in order.
const cards = (html) =>
  [...html.matchAll(/<h3 class="govuk-summary-card__title">([^<]*)</g)].map(
    ([, title]) => title,
  );

try {
  // [address page, its waste subpage, the links between them]: a number
  // only counts on a split street (elsewhere the page drops it, as before).
  for (const [path, waste, links = [path, waste]] of [
    [STREET, `${STREET}/smieci`],
    [`${STREET}?nr=12`, `${STREET}/smieci?nr=12`, [STREET, `${STREET}/smieci`]],
    [VILLAGE, `${VILLAGE}/smieci`],
    [`${SPLIT}?nr=7a`, `${SPLIT}/smieci?nr=7a`],
  ]) {
    const { status, main: hub, html } = await main(path);
    if (status !== 200) fail(path, `${status}, want 200`);
    if (
      !/<span class="govuk-caption-l">[^<]+<\/span><h1 class="govuk-heading-l">[^<]+<\/h1>/.test(
        hub,
      )
    )
      fail(path, "no caption and h1");
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
    const crumbs =
      /<nav class="govuk-breadcrumbs[^"]*" aria-label="[^"]+"><ol class="govuk-breadcrumbs__list">([\s\S]*?)<\/ol><\/nav>/.exec(
        sub.main,
      )?.[1] ?? "";
    const items = [
      ...crumbs.matchAll(
        /<li class="govuk-breadcrumbs__list-item"( aria-current="page")?>([\s\S]*?)<\/li>/g,
      ),
    ];
    const village = path.startsWith(VILLAGE);
    const place = path.split("?")[0];
    if (
      items.length !== (village ? 2 : 3) ||
      items.at(-1)?.[1] !== ' aria-current="page"' ||
      items.at(-1)?.[2] !== "Odbiór śmieci" ||
      items.slice(0, -1).some(([, current]) => current) ||
      !items
        .at(-2)?.[2]
        .startsWith(`<a class="govuk-breadcrumbs__link" href="${links[0]}">`) ||
      (!village && items[0][2].includes("<a"))
    )
      fail(
        waste,
        `breadcrumbs ${JSON.stringify(items.map(([, c, t]) => [c, t]))} (${place})`,
      );
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
  const wrong = await main(`${SPLIT}?nr=42`);
  if (
    !wrong.main.includes("govuk-error-summary") ||
    cards(wrong.main).length > 0
  )
    fail(`${SPLIT}?nr=42`, "not the street page's error");
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

/** 375-<page>-nr5.png, and the note's ink-free box gaps, in CSS px. */
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
      ["hub", `${STREET}?nr=5`],
      ["smieci", `${STREET}/smieci?nr=5`],
    ]) {
      await page.goto(server.origin + url, { waitUntil: "load" });
      const gaps = await page.evaluate(() => {
        const h1 = document.querySelector("main h1").getBoundingClientRect();
        const note = document
          .querySelector("main h1 + p")
          .getBoundingClientRect();
        const change = document
          .querySelector("main h1 + p + p")
          .getBoundingClientRect();
        return {
          h1ToNote: note.top - h1.bottom,
          noteToChange: change.top - note.bottom,
          left: note.left - h1.left,
        };
      });
      console.log(`${url} [375px]: ${JSON.stringify(gaps)}`);
      await page.screenshot({
        path: path.join(dir, `375-${name}-nr5.png`),
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
