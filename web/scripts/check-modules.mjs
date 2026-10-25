// The address page as a hub of modules (components/hub.tsx, lib/modules.ts)
// and the waste subpage (/adres/<id>/smieci), on the CI fixture with the
// build's IMGW setting (mock:none in CI; check-warnings.mjs covers warnings):
// - breadcrumbs (GOV.UK's, every item a link, the page itself left out):
//   the hub „Strona główna › <locality>” (a street's to its locality's
//   line on /ulice, #m-<SIMC>; a village part's to its village's line;
//   any other village's to the villages; a village names its gmina),
//   /smieci adds the address page; the street page's
//   error variants keep the hub's;
// - the hub: no caption (the locality is in its breadcrumbs), one h1,
//   „Zmień adres”, no summary cards: a section per module (task 131), waste
//   first (h2 „Śmieci”, its „Wszystkie odbiory śmieci” link to /smieci, ?nr= kept,
//   last in the section), a visible section break between each pair of
//   sections and none before the first or after the last, its
//   rows (Najbliższy odbiór with an absolute date, Pojemniki, Źródło), no
//   calendar, PDF or IMGW banner, „Bez zapowiedzi” with the weather and its
//   source; „Ostatnio sprawdziliśmy” (the fixture has no source_files rows,
//   so the day events.checkedAt, no time)
//   under the waste list's last source (a row with no border) and after the weather's line (IMGW's
//   fetchedAt, with its time), each module's one freshness text; headings h1 → h2 with no h3 and no skips; the fixture's dates are
//   unverified: one short „Uwaga” sentence linking the gmina's schedule,
//   while /smieci keeps the full note;
// - a split street without a number: the waste section asks for it,
//   linking /smieci; with one, it has its date; an unknown number keeps the street
//   page's error (GOV.UK's validation pattern);
// - /smieci: caption, h1 „Odbiór śmieci”, the checked line (its one
//   freshness text), the calendar and the PDF;
// - a house number on a street with one schedule: both pages say, right
//   under the h1, that it changes nothing; never on a split street, a
//   village or without a number;
// - /woda without a ZUK file: breadcrumbs, h1, the gmina's news, noindex,
//   no calendar button; its woda.ics an empty calendar, noindex (an
//   unknown address's a 404);
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
// Krowica Sama: a village with a street, a place of its own all the same,
// in the fixture's sektor 2. PRG has nr 40 there (no street), not 9999.
const STREETED_VILLAGE = "/adres/0606180";
const VILLAGE_PART = "/adres/0606300";
const BARE_VILLAGE_PART = "/adres/0606027";
const MAIN = /<main[\s\S]*<\/main>/;
// The waste module's line: the CI fixture has no source_files rows, so
// events.checkedAt, the day it was made (a day, so no time).
const WASTE_CHECKED = String.raw`Ostatnio sprawdziliśmy: \d{1,2} \p{L}+`;
// Freshness texts besides that line (tasks 118-120: one per module).
const FRESHNESS = /Ostatnio sprawdziliśmy|sprawdzono|Stan na/g;
const freshness = (html) => html.match(FRESHNESS)?.length ?? 0;
const DATE = String.raw`\p{L}+, \d{1,2} \p{L}+`;
// PRG has nr 1-7 at ul. Adama Asnyka (lib/prg.ts), so 12 gets its hint
// first, then the shared schedule without the number again.
const NOTE = sharedNumberNote(
  { kind: "ulica", zoneId: "", nr: null, askNumber: false, givenNr: "12" },
  true,
);
const PRG_NOTE =
  "Nie znaleźliśmy nr 12 przy tej ulicy w rejestrze adresów. Sprawdź, czy numer jest dobry.";

const server = await startServer(3312);
const failures = [];
const fail = (path, message) => failures.push(`${path}: ${message}`);

async function main(path) {
  const response = await fetch(`${server.origin}${path}`);
  const html = await response.text();
  vagueLinks(path, html);
  return { status: response.status, main: MAIN.exec(html)?.[0] ?? "", html };
}

// Link text says where it goes (docs/layout.md): no link whose visible
// text, without its visually hidden part, is a bare „Szczegóły”.
const VAGUE = new Set(["Szczegóły", "Kliknij tutaj"]);
function vagueLinks(path, html) {
  for (const [, inner] of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    const text = inner
      .replace(/<span class="govuk-visually-hidden">[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (VAGUE.has(text)) fail(path, `a link reading only „${text}”`);
  }
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

// The module sections' titles, in order („Bez zapowiedzi” has a hyphen in
// its id).
const sections = (html) =>
  [
    ...html.matchAll(
      /<section aria-labelledby="([a-z]+)-heading"><h2 id="\1-heading" class="govuk-heading-l">([^<]*)</g,
    ),
  ].map(([, , title]) => title);

const BREAK =
  '<hr class="govuk-section-break govuk-section-break--l govuk-section-break--visible"/>';

// The hub's outline (task 131): no summary cards, one h1, no h3, the
// modules in <div id="co-cie-czeka"> (the alert slot's „I jeszcze …”), one
// visible section break between each pair of sections, none before the
// first or after the last.
function hubOutline(path, hub) {
  if (hub.includes("govuk-summary-card")) fail(path, "a summary card");
  const h1s = hub.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) fail(path, `${h1s} h1s, want 1`);
  if (/<h3[\s>]/.test(hub)) fail(path, "an h3");
  if (!hub.includes('<div id="co-cie-czeka"><section aria-labelledby="'))
    fail(path, "the modules not first in #co-cie-czeka");
  const parts = hub.split(/<section aria-labelledby="[^"]+">/).slice(1);
  if (parts.length < 2) fail(path, `${parts.length} sections`);
  const gaps = parts.map((part) =>
    part.slice(part.lastIndexOf("</section>") + "</section>".length),
  );
  if (gaps.slice(0, -1).some((gap) => !gap.endsWith(BREAK)))
    fail(path, `not one section break between sections ${gaps}`);
  if ((hub.match(/<hr[\s/>]/g)?.length ?? 0) !== parts.length - 1)
    fail(path, "a section break outside the gaps between sections");
  // No row borders on the hub: the section break is the only line.
  const lists = hub.match(/<dl class="[^"]*"/g) ?? [];
  if (
    lists.length === 0 ||
    lists.some(
      (dl) =>
        dl !== '<dl class="govuk-summary-list govuk-summary-list--no-border"',
    )
  )
    fail(path, `not every summary list without borders ${lists}`);
  if (hub.includes("govuk-summary-list__row--no-border"))
    fail(path, "a row-level --no-border");
}

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
      STREETED_VILLAGE,
      `${STREETED_VILLAGE}/smieci`,
      VILLAGES("Gmina Lubaczów"),
      "Krowica Sama",
    ],
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
    hubOutline(path, hub);
    if (sections(hub)[0] !== "Śmieci") fail(path, `sections ${sections(hub)}`);
    const action = `<p class="govuk-body"><a class="govuk-link" href="${links[1]}">Wszystkie odbiory śmieci</a></p></section>`;
    if (!hub.includes(action))
      fail(
        path,
        `no „Wszystkie odbiory śmieci” to ${links[1]} closing its section`,
      );
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
    if (/href="\/ics\/|harmonogram\.pdf|woda\.ics|do kalendarza/.test(hub))
      fail(path, "a calendar or PDF link");
    if (/govuk-notification-banner/.test(hub)) fail(path, "the IMGW banner");
    // No ZUK file in CI: water first, with the gmina's news only.
    if (
      !/<h2 id="bez-zapowiedzi-heading"[^>]*>Bez zapowiedzi<\/h2><p class="govuk-body">Woda: nie udało się nam sprawdzić komunikatów\. Źródło: <a href="https:\/\/www\.gminalubaczow\.pl\/aktualnosci\/" class="govuk-link">aktualności gminy Lubaczów<\/a>\.<\/p>/.test(
        hub,
      )
    )
      fail(path, "no „Bez zapowiedzi” line for the water");
    if (
      !/<\/p><p class="govuk-body">Pogoda: brak ostrzeżeń IMGW\. Źródło: <a href="https:\/\/meteo\.imgw\.pl\/" class="govuk-link">IMGW-PIB<\/a>\.(?:<!-- -->)? Ostatnio sprawdziliśmy: /.test(
        hub,
      )
    )
      fail(path, "no „Bez zapowiedzi” line for the weather");
    // The checked line: under the waste list's last source, after the
    // weather's „Bez zapowiedzi” line (the copy's fetchedAt).
    if (
      !new RegExp(
        `<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Źródło</dt><dd class="govuk-summary-list__value">(?:(?!</dd>).)*<span class="govuk-hint govuk-!-font-size-16 [^"]*">${WASTE_CHECKED}</span></dd></div></dl>`,
        "su",
      ).test(hub)
    )
      fail(path, "no day-only checked line under the waste list's last row");
    if (
      !/<p class="govuk-body">Pogoda: brak ostrzeżeń IMGW\.(?:(?!<\/p>).)* Ostatnio sprawdziliśmy: \d{1,2} \p{L}+, \d{1,2}:\d{2}\.<\/p>/su.test(
        hub,
      )
    )
      fail(path, "no checked line after the weather");
    // Waste's and the weather's lines; the water has no file in CI.
    if (freshness(hub) !== 2)
      fail(path, `${freshness(hub)} freshness texts, not one per module`);
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
    const underH1 = new RegExp(
      `</h1><p class="govuk-body">${PRG_NOTE} ${NOTE}</p>`,
    );
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
    // Subpages keep GOV.UK's row borders (only the hub drops them).
    if (
      !sub.main.includes('<dl class="govuk-summary-list">') ||
      sub.main.includes("no-border")
    )
      fail(waste, "the pickup list without row borders");
    if (!sub.main.includes(UNVERIFIED_NOTE)) fail(waste, "no unverified note");
    if (!new RegExp(`>${WASTE_CHECKED}</p>`, "u").test(sub.main))
      fail(waste, "no day-only checked line");
    if (freshness(sub.main) !== 1)
      fail(waste, `${freshness(sub.main)} freshness texts, not one`);
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

  // /woda without a ZUK file (CI): breadcrumbs, caption and h1, the gmina's
  // news, no checked line; never a search result.
  const waterPath = `${STREET}/woda`;
  const water = await main(waterPath);
  if (water.status !== 200) fail(waterPath, `${water.status}, want 200`);
  crumbsAre(waterPath, water.main, [HOME, TOWN, [STREET, "ul. Adama Asnyka"]]);
  if (
    !/<span class="govuk-caption-l">[^<]+<\/span><h1 class="govuk-heading-l">Przerwy w dostawie wody<\/h1>/.test(
      water.main,
    )
  )
    fail(waterPath, "no caption and h1 „Przerwy w dostawie wody”");
  if (
    !water.main.includes("Nie udało się nam teraz sprawdzić") ||
    !water.main.includes('href="https://www.gminalubaczow.pl/aktualnosci/"')
  )
    fail(waterPath, "no fallback to the gmina's news");
  if (water.main.includes("Ostatnio sprawdziliśmy"))
    fail(waterPath, "a checked line without a file");
  if (!/<meta name="robots" content="noindex/.test(water.html))
    fail(waterPath, "not noindex");
  headingsInOrder(waterPath, water.main);
  // No cut to add: no calendar button; the file is an empty calendar (as a
  // waste zone with no dates), never a search result.
  if (/woda\.ics|do kalendarza/.test(water.main))
    fail(waterPath, "a calendar button without a cut");
  const icsPath = `${waterPath}.ics?nr=5`;
  const ics = await fetch(`${server.origin}${icsPath}`);
  const icsBody = await ics.text();
  if (
    ics.status !== 200 ||
    !ics.headers.get("content-type")?.startsWith("text/calendar") ||
    !ics.headers.get("x-robots-tag")?.includes("noindex") ||
    !icsBody.startsWith("BEGIN:VCALENDAR\r\n") ||
    !icsBody.endsWith("END:VCALENDAR\r\n") ||
    icsBody.includes("BEGIN:VEVENT")
  )
    fail(icsPath, `${ics.status}: not an empty, noindex calendar`);
  const unknown = await fetch(`${server.origin}/adres/0000000/woda.ics`);
  if (unknown.status !== 404)
    fail("/adres/0000000/woda.ics", `${unknown.status}, want 404`);

  // A split street: the number first, then its dates; a wrong one keeps the
  // street page's error.
  const ask = await main(SPLIT);
  if (sections(ask.main)[0] !== "Śmieci") fail(SPLIT, "no waste section");
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
    sections(wrong.main).length > 0
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

  // Krowica Sama's own schedule (sektor 2) and its calendar; the address
  // register knows every number in it, so only a made-up one gets the hint.
  const streeted = await main(`${STREETED_VILLAGE}/smieci`);
  if (
    !streeted.main.includes("Krowica Sama, sektor 2") ||
    !streeted.main.includes('href="/ics/waste%3Agmina-s2')
  )
    fail(`${STREETED_VILLAGE}/smieci`, "not sektor 2 with its calendar");
  for (const [nr, hint] of [
    ["40", false],
    ["9999", true],
  ]) {
    const path = `${STREETED_VILLAGE}/nr/${nr}`;
    const page = await main(path);
    if (page.status !== 200) fail(path, `${page.status}, want 200`);
    const has = page.main.includes(
      `Nie znaleźliśmy nr ${nr} w tej miejscowości w rejestrze adresów.`,
    );
    if (has !== hint) fail(path, hint ? "no PRG hint" : "a PRG hint");
  }
  // The other pages, for vague links only.
  for (const path of [
    "/",
    "/ulice",
    "/o-projekcie",
    "/dostepnosc",
    "/prywatnosc",
  ]) {
    const page = await main(path);
    if (page.status !== 200) fail(path, `${page.status}, want 200`);
  }
  // The town is no place of its own.
  const town = await fetch(`${server.origin}/adres/0972447`);
  if (town.status !== 404) fail("/adres/0972447", `${town.status}, want 404`);

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
  "Modules: the hub (sections, no cards, waste first, no calendar, water and weather under „Bez zapowiedzi”), /smieci (breadcrumbs, h1, calendar, PDF) and /woda (fallback).",
);
