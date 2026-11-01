// The address page as a hub of modules (components/hub.tsx, lib/modules.ts)
// and the waste subpage (/adres/<id>/smieci), on the CI fixture with the
// build's IMGW setting (mock:none in CI; check-warnings.mjs covers warnings):
// - breadcrumbs (GOV.UK's, every item a link, the page itself left out),
//   right before <main>, never inside it (task 149): the hub
//   „Strona główna › <locality>” (a street's to its locality's line on
//   /ulice, #m-<SIMC>; a village part's to its village's line;
//   any other village's to the villages; a village names its gmina),
//   /smieci adds the address page; the street page's
//   error variants keep the hub's; none on the flat pages (
//   /o-projekcie, /prywatnosc, /dostepnosc, /ulice), the home page or a 404;
// - the hub: no caption (the locality is in its breadcrumbs), one h1,
//   „Zmień adres”, no summary cards or lists: „Najbliższe dni” only with a
//   pickup today or tomorrow (no water or warning in CI), its links to the
//   sections' anchors; a section per module, always, Śmieci, Woda, Pogoda
//   (tasks 131, 207), each its id as its anchor, a visible section break
//   between each pair of sections (and after the block), none after the
//   last; waste: the next pickup's date, its lead („Jutro: ”, „Za 5 dni: ”)
//   for 7 days, „Tego dnia odbiorą…:” and its
//   bins in a row, its „Wszystkie odbiory śmieci” link to /smieci (?nr=
//   kept), then its meta line, last: „Źródło: …”, the fixture's dates
//   unverified, so one short sentence (while /smieci keeps the full note),
//   and „Sprawdziliśmy” with the day (the fixture has no source_files rows,
//   so events.checkedAt, no time); water: „Nie udało się nam sprawdzić
//   komunikatów.” (no file in CI), its link to /woda, its sources and no
//   check; weather: „Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.”, no
//   link, IMGW-PIB and the copy's fetchedAt with its time; each module's
//   one freshness text; no calendar, PDF or IMGW banner; headings h1 → h2
//   with no h3 and no skips;
// - a split street without a number: the waste section asks for it,
//   linking /smieci; with one, it has its date; an unknown number keeps the street
//   page's error (GOV.UK's validation pattern);
// - /smieci: caption, h1 „Odbiór śmieci”, the checked line (its one
//   freshness text), the calendar with its help (no „Dodano”) and the PDF;
// - a house number on a street with one schedule: both pages say, right
//   under the h1, that it changes nothing; never on a split street, a
//   village or without a number;
// - /woda without a water file: breadcrumbs, h1, the gmina's news (in the
//   town, MZGKiM's posts too), noindex,
//   no calendar button or its help; its woda.ics an empty calendar, noindex (an
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
import {
  laterNote,
  SHORT_UNVERIFIED_NOTE,
  sharedNumberNote,
  unverifiedNote,
} from "../lib/schedule-notes.ts";
import {
  closeRenderedPages,
  finish,
  notFoundAt,
  renderedPage,
  startServer,
} from "./lib/server.mjs";

const STREET = "/adres/0972447-00470";
// The page's, the calendar's and the PDF's line after the last date.
const LATER = laterNote([{ date: "" }]);
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
// Lines of a group, close under each other (components/hub.tsx).
const CLOSE = "govuk-!-margin-bottom-2";
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The waste subpage's checked line: the CI fixture has no source_files rows,
// so events.checkedAt, the day it was made (a day, so no time).
const WASTE_CHECKED = String.raw`Wywozy sprawdziliśmy: \d{1,2} \p{L}+`;
// The town's streets (SIMC 0972447) are the Urząd Miejski's schedule, the
// rest the gmina's (lib/places.ts scheduleOwner).
const TOWN_SIMC = "/adres/0972447";
const gminaOf = (path) =>
  path.startsWith(TOWN_SIMC) ? "Lubaczów (miasto)" : "Lubaczów (gmina)";
// Freshness texts besides that line (tasks 118-120: one per module); on the
// hub, each section's „Sprawdziliśmy …” (task 207).
const FRESHNESS = / sprawdziliśmy: |Sprawdziliśmy |sprawdzono|Stan na/g;
const freshness = (html) => html.match(FRESHNESS)?.length ?? 0;
// PRG has nr 1-7 at ul. Adama Asnyka (lib/prg.ts): 5 is a number of the
// street, with its shared schedule; 12 is not, so one warning and the
// whole street (lib/prg.ts numberWarning).
const NOTE = sharedNumberNote({
  kind: "ulica",
  zoneId: "",
  nr: null,
  askNumber: false,
  givenNr: "5",
});
const warning = (nr, whole = "całą miejscowość") =>
  `Nie znaleźliśmy nr „${nr}” pod tym adresem – pokazujemy ${whole}.`;

const server = await startServer(3312);
const failures = [];
const fail = (path, message) => failures.push(`${path}: ${message}`);

// The page with its live blocks in (scripts/lib/server.mjs renderedPage).
async function main(path) {
  const { status, html } = await renderedPage(`${server.origin}${path}`);
  vagueLinks(path, html);
  return { status, main: MAIN.exec(html)?.[0] ?? "", html };
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

// The whole page's HTML: the breadcrumbs stand before <main>, as GOV.UK
// places them, so the skip link (#main-content) skips them.
function crumbsAre(path, html, want) {
  if (
    !/<\/ol><\/nav><main class="govuk-main-wrapper" id="main-content">/.test(
      html,
    ) ||
    MAIN.exec(html)?.[0].includes("govuk-breadcrumbs")
  )
    fail(path, "breadcrumbs not right before <main>");
  const got = crumbs(html);
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(
      path,
      `breadcrumbs ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
}

// The module sections' titles, in order.
const sections = (html) =>
  [
    ...html.matchAll(
      /<section id="([a-z]+)" aria-labelledby="\1-heading"><h2 id="\1-heading" class="govuk-heading-l">([^<]*)</g,
    ),
  ].map(([, , title]) => title);

// A section's first line's lead (components/upcoming.tsx DayLead):
// „Dziś: ”, „Jutro: ”, „Za 2 dni: ” to „Za 7 dni: ”, then the date in lower
// case; further away, the date alone, capitalised.
const LEAD = "(?:(?:Dziś|Jutro|Za [2-7] dni): \\p{Ll}|\\p{Lu})";

const BREAK =
  '<hr class="govuk-section-break govuk-section-break--l govuk-section-break--visible"/>';

// „Najbliższe dni” (task 207, components/upcoming.tsx), only while
// something is shown.
const UPCOMING =
  '<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe dni</h2><ul class="govuk-list govuk-list--spaced">';

// The hub's outline (tasks 131, 207): no summary cards or lists, one h1, no
// h3; „Najbliższe dni”, if shown, before the modules, its links to their
// sections' anchors (#woda), a section break after it; each module's
// section its id as its anchor; one visible section break between each
// pair of sections, none after the last.
function hubOutline(path, hub) {
  if (hub.includes("govuk-summary-card")) fail(path, "a summary card");
  const h1s = hub.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) fail(path, `${h1s} h1s, want 1`);
  if (/<h3[\s>]/.test(hub)) fail(path, "an h3");
  const upcoming = hub.indexOf(UPCOMING);
  const first = hub.search(/<section id="[a-z]+" aria-labelledby="/);
  if (upcoming > first) fail(path, "„Najbliższe dni” after the modules");
  if (upcoming >= 0) {
    const block = hub.slice(upcoming, first);
    if (!block.endsWith(`</section>${BREAK}`))
      fail(path, "no section break after „Najbliższe dni”");
    const ids = new Set(
      [...hub.matchAll(/<section id="([a-z]+)"/g)].map(([, id]) => id),
    );
    for (const [, id] of block.matchAll(
      /<a class="govuk-link" href="#([^"]+)">Szczegóły i źródło<span class="govuk-visually-hidden">: [^<]+<\/span><\/a>/g,
    ))
      if (!ids.has(id)) fail(path, `a link to #${id}, no such section`);
    if (!/href="#[a-z]+">Szczegóły i źródło/.test(block))
      fail(path, "„Najbliższe dni” without its links");
  }
  const parts = hub
    .split(/<section id="[a-z]+" aria-labelledby="[^"]+">/)
    .slice(1);
  if (parts.length < 2) fail(path, `${parts.length} sections`);
  const gaps = parts.map((part) =>
    part.slice(part.lastIndexOf("</section>") + "</section>".length),
  );
  if (gaps.slice(0, -1).some((gap) => !gap.endsWith(BREAK)))
    fail(path, `not one section break between sections ${gaps}`);
  const breaks = parts.length - 1 + (upcoming >= 0 ? 1 : 0);
  if ((hub.match(/<hr[\s/>]/g)?.length ?? 0) !== breaks)
    fail(path, "a section break outside the gaps between sections");
  // Lines, not summary lists: the section break is the only line.
  if (/<dl[\s>]/.test(hub)) fail(path, "a summary list");
}

try {
  // [address page, its waste subpage, the hub's breadcrumbs, the address
  // page's name in /smieci's, the links between them]: the number given
  // stays in both links; the name shows it only on a split street.
  for (const [path, waste, locality, name, links = [path, waste]] of [
    [STREET, `${STREET}/smieci`, TOWN, "ul. Adama Asnyka"],
    // The number changes nothing here, but both links keep it, so the note
    // stays on the way back.
    [`${STREET}?nr=5`, `${STREET}/smieci?nr=5`, TOWN, "ul. Adama Asnyka 5"],
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
    crumbsAre(path, html, [HOME, locality]);
    if (
      !/^<main[^>]*><div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds"><h1 class="govuk-heading-l">[^<]+<\/h1>/.test(
        hub,
      )
    )
      fail(path, "not the h1 first in <main>, with no caption");
    if (!hub.includes(">Zmień adres<")) fail(path, "no „Zmień adres”");
    hubOutline(path, hub);
    if (sections(hub).join() !== "Śmieci,Woda,Pogoda")
      fail(path, `sections ${sections(hub)}`);
    // No water file and no IMGW warning in CI: „Najbliższe dni” holds a
    // pickup today or tomorrow, as the waste section's lead says, or is
    // not there at all.
    const soon =
      /class="govuk-heading-l">Śmieci<\/h2><p[^>]*>(?:Dziś|Jutro):/.test(hub);
    if (hub.includes(UPCOMING) !== soon)
      fail(path, `„Najbliższe dni” ${soon ? "missing" : "with nothing soon"}`);
    if (soon && !/<strong>(?:Dziś|Jutro)<\/strong> odbiór śmieci: /.test(hub))
      fail(path, "„Najbliższe dni” without the pickup");
    // Waste: the date, what goes, the bins in a row; the fixture's 6:00.
    if (
      !new RegExp(
        `>Śmieci</h2><p class="govuk-body ${CLOSE}">${LEAD}\\p{L}+, \\d{1,2} \\p{L}+</p><p class="govuk-body ${CLOSE}">Tego dnia odbiorą(?: wszystkie pojemniki)?:</p><div class="govuk-!-margin-bottom-4"><ul class="govuk-list govuk-!-margin-bottom-0"><li class="govuk-!-display-inline-block govuk-!-margin-right-3"><span aria-hidden="true"><svg aria-hidden="true" width="14" height="20" `,
        "u",
      ).test(hub)
    )
      fail(path, "no absolute next pickup date and its bins in a row");
    // The village's sektor 1 has the fixture's 6:00; the town has none.
    const putOut = '<p class="govuk-body">Wystaw je do 6:00 rano.</p>';
    const from = hub.indexOf('<section id="smieci"');
    const section = hub.slice(from, hub.indexOf("</section>", from));
    if (
      (path === VILLAGE && !section.includes(putOut)) ||
      section.split("Wystaw").length !== section.split(putOut).length
    )
      fail(path, "not „Wystaw je do 6:00 rano.” as its own line");
    // Its link, then its meta line, last: the source, the short unverified
    // sentence, the day we checked.
    const action = `<p class="govuk-body"><a class="govuk-link" href="${links[1]}">Wszystkie odbiory śmieci</a></p>`;
    if (
      !new RegExp(
        `${escaped(action)}<p class="govuk-body-s">Źródło: <a href="https://[^"]+" class="govuk-link">harmonogram [^<]+</a>, [^<]+\\. ${escaped(SHORT_UNVERIFIED_NOTE)} Sprawdziliśmy \\d{1,2} \\p{L}+\\.</p></section>`,
        "u",
      ).test(hub)
    )
      fail(path, "not „Wszystkie odbiory śmieci”, then the meta line, last");
    if (hub.includes(unverifiedNote(gminaOf(path))))
      fail(path, "the subpage's full unverified note");
    // Relative words only where the island puts them: „Najbliższe dni” and
    // each section's first line (components/upcoming.tsx).
    const fixed = hub
      .replace(
        /<section aria-labelledby="najblizsze-dni">[\s\S]*?<\/section>/,
        "",
      )
      .replaceAll(
        /(class="govuk-heading-l">[^<]*<\/h2>)<p[^>]*>[^<]*<\/p>/g,
        "$1",
      );
    if (/\b(dziś|jutro|pojutrze|za \d+ dni|teraz)\b/i.test(fixed))
      fail(path, "a relative date outside the island's places");
    if (
      /href="\/ics\/|harmonogram\.pdf|woda\.ics|do kalendarza|czy się udało/.test(
        hub,
      )
    )
      fail(path, "a calendar or PDF link");
    if (/govuk-notification-banner/.test(hub)) fail(path, "the IMGW banner");
    // No water file in CI (neither the gmina's nor MZGKiM's): "nie udało
    // się nam sprawdzić", the link to /woda, the gmina's news; in the town,
    // MZGKiM's posts too; no check.
    const mzgkim =
      locality === TOWN
        ? '; <a href="https://mzgkim.lubaczow.pl/category/komunikaty/" class="govuk-link">komunikaty MZGKiM</a>'
        : "";
    const water = links[1].replace("/smieci", "/woda");
    if (
      !hub.includes(
        `<h2 id="woda-heading" class="govuk-heading-l">Woda</h2><p class="govuk-body">Nie udało się nam sprawdzić komunikatów.</p><p class="govuk-body"><a class="govuk-link" href="${water}">Wszystkie przerwy w wodzie</a></p><p class="govuk-body-s">Źródło: <a href="https://www.gminalubaczow.pl/aktualnosci/" class="govuk-link">aktualności gminy Lubaczów</a>${mzgkim}.</p></section>`,
      )
    )
      fail(path, "not the water section");
    // The weather: no link but its source's, checked with the copy's time.
    if (
      !/<h2 id="pogoda-heading" class="govuk-heading-l">Pogoda<\/h2><p class="govuk-body">Brak ostrzeżeń IMGW dla powiatu lubaczowskiego\.<\/p><p class="govuk-body-s">Źródło: <a href="https:\/\/meteo\.imgw\.pl\/" class="govuk-link">IMGW-PIB<\/a>\. Sprawdziliśmy \d{1,2} \p{L}+, \d{1,2}:\d{2}\.<\/p><\/section>/u.test(
        hub,
      )
    )
      fail(path, "not the weather section");
    // Waste's and the weather's; the water has no file in CI.
    if (freshness(hub) !== 2)
      fail(path, `${freshness(hub)} freshness texts, not one per module`);
    headingsInOrder(path, hub);
    // The note right under the h1, only for the street with one schedule.
    const note = path === `${STREET}?nr=5`;
    const underH1 = new RegExp(`</h1><p class="govuk-body">${NOTE}</p>`);
    if (note !== underH1.test(hub))
      fail(path, note ? "no note under the h1" : "a house-number note");
    if (!note && hub.includes("Harmonogram jest wspólny"))
      fail(path, "a house-number note");
    // The number the page does not need stays out of the title.
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    // A number the register has: in the title, as in the h1 (item 6).
    if (note && !title.startsWith("ul. Adama Asnyka 5"))
      fail(path, `title ${title}`);

    const sub = await main(waste);
    if (sub.status !== 200) fail(waste, `${sub.status}, want 200`);
    crumbsAre(waste, sub.html, [HOME, locality, [links[0], name]]);
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
    // The calendar's help (CalendarBlock): the page's hint, then the closed
    // details with the steps.
    if (
      !sub.main.includes('<p class="govuk-body">Plik z datami wywozu.</p>') ||
      !/<details class="govuk-details"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">Jak dodać i sprawdzić, czy się udało\?<\/span>[\s\S]*?iPhone: telefon pokaże daty[\s\S]*?calendar\.google\.com[^<]*<\/li><\/ul><\/div><\/details>/.test(
        sub.main,
      ) ||
      sub.main.includes("Dodano")
    )
      fail(waste, "no calendar help, or it says „Dodano”");
    if (!sub.main.includes('id="pickups-heading"')) fail(waste, "no pickups");
    // Subpages keep GOV.UK's row borders (only the hub drops them).
    if (
      !sub.main.includes('<dl class="govuk-summary-list">') ||
      sub.main.includes("no-border")
    )
      fail(waste, "the pickup list without row borders");
    if (!sub.main.includes(unverifiedNote(gminaOf(waste))))
      fail(waste, "no unverified note");
    // After the last date: the next year's, when published (task 205).
    if (!sub.main.includes(`<p class="govuk-body">${LATER}</p></section>`))
      fail(waste, "no line about the next year's dates");
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

  // /woda without a water file (CI): breadcrumbs, caption and h1, the gmina's
  // and MZGKiM's news (a town street), no checked line; never a search result.
  const waterPath = `${STREET}/woda`;
  const water = await main(waterPath);
  if (water.status !== 200) fail(waterPath, `${water.status}, want 200`);
  crumbsAre(waterPath, water.html, [HOME, TOWN, [STREET, "ul. Adama Asnyka"]]);
  if (
    !/<span class="govuk-caption-l">[^<]+<\/span><h1 class="govuk-heading-l">Przerwy w dostawie wody<\/h1>/.test(
      water.main,
    )
  )
    fail(waterPath, "no caption and h1 „Przerwy w dostawie wody”");
  if (
    !water.main.includes("Nie udało się nam teraz sprawdzić") ||
    !water.main.includes('href="https://www.gminalubaczow.pl/aktualnosci/"') ||
    !water.main.includes(
      'href="https://mzgkim.lubaczow.pl/category/komunikaty/" class="govuk-link">komunikatów MZGKiM</a>',
    )
  )
    fail(waterPath, "no fallback to the gmina's and MZGKiM's news");
  if (water.main.includes("Komunikaty o wodzie sprawdziliśmy"))
    fail(waterPath, "a checked line without a file");
  if (!/<meta name="robots" content="noindex/.test(water.html))
    fail(waterPath, "not noindex");
  headingsInOrder(waterPath, water.main);
  // No cut to add: no calendar button; the file is an empty calendar (as a
  // waste zone with no dates), never a search result.
  if (/woda\.ics|do kalendarza|czy się udało/.test(water.main))
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

  // A module after a house number is no page: 308 to the module's subpage
  // with the number in the query (next.config.ts, task 205).
  for (const [from, to] of [
    [`${VILLAGE}/nr/44/woda`, `${VILLAGE}/woda?nr=44`],
    [`${STREET}/nr/5/smieci`, `${STREET}/smieci?nr=5`],
    [`${STREET}/nr/7/22/woda`, `${STREET}/woda?nr=7/22`],
  ]) {
    const res = await fetch(`${server.origin}${from}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    // The slash may come back encoded; either is the same query.
    if (res.status !== 308 || !decodeURIComponent(location).endsWith(to))
      fail(from, `${res.status} to „${location}”, want 308 to ${to}`);
  }

  // No x-powered-by anywhere (next.config.ts poweredByHeader).
  for (const path of [STREET, "/ulice", "/nie-ma-takiej-strony"]) {
    const res = await fetch(`${server.origin}${path}`);
    if (res.headers.has("x-powered-by")) fail(path, "an x-powered-by header");
  }

  // The waste calendar: the next year's line in its description, no event
  // for it; the town's names the Urząd Miejski, the gmina's the gmina.
  for (const [path, owner, other] of [
    [`${STREET}/smieci`, "Urzędu Miejskiego", "harmonogram gminy"],
    [`${VILLAGE}/smieci`, "harmonogram gminy", "Urzędu Miejskiego"],
  ]) {
    const page = await main(path);
    const href = /href="(\/ics\/[^"]+)"/.exec(page.main)?.[1];
    if (!href) {
      fail(path, "no waste calendar link");
      continue;
    }
    const body = await (await fetch(`${server.origin}${href}`)).text();
    const unfolded = body.replace(/\r\n /g, "");
    if (!unfolded.includes(`\r\nX-WR-CALDESC:${LATER.replace(",", "\\,")}\r\n`))
      fail(href, "no X-WR-CALDESC with the next year's line");
    if (/BEGIN:VEVENT(?:(?!END:VEVENT)[\s\S])*Terminy na/.test(unfolded))
      fail(href, "the next year's line as an event");
    if (!unfolded.includes(owner) || unfolded.includes(other))
      fail(href, `not „${owner}”, or „${other}”`);
  }

  // A split street: the number first, then its dates; a wrong one keeps the
  // street page's error.
  const ask = await main(SPLIT);
  if (sections(ask.main)[0] !== "Śmieci") fail(SPLIT, "no waste section");
  if (
    !ask.main.includes(
      `<a class="govuk-link" href="${SPLIT}/smieci">Podaj numer domu</a>`,
    )
  )
    fail(SPLIT, "no „Podaj numer domu” to /smieci");
  if (ask.main.includes('href="/ics/')) fail(SPLIT, "a calendar link");
  crumbsAre(SPLIT, ask.html, [HOME, TOWN]);
  const wrong = await main(`${SPLIT}?nr=42`);
  if (
    !wrong.main.includes("govuk-error-summary") ||
    sections(wrong.main).length > 0
  )
    fail(`${SPLIT}?nr=42`, "not the street page's error");
  crumbsAre(`${SPLIT}?nr=42`, wrong.html, [HOME, TOWN]);
  const askSub = `${SPLIT}/smieci`;
  crumbsAre(askSub, (await main(askSub)).html, [
    HOME,
    TOWN,
    [SPLIT, "ul. Tadeusza Kościuszki"],
  ]);
  // A wrong number on a split street goes back with it (the hub's error);
  // no usable number (/numer) goes back without.
  crumbsAre(
    `${SPLIT}/smieci?nr=42`,
    (await main(`${SPLIT}/smieci?nr=42`)).html,
    [HOME, TOWN, [`${SPLIT}?nr=42`, "ul. Tadeusza Kościuszki"]],
  );
  for (const nr of ["", "x!"]) {
    const path = `${STREET}/smieci?nr=${nr}`;
    crumbsAre(path, (await main(path)).html, [
      HOME,
      TOWN,
      [STREET, "ul. Adama Asnyka"],
    ]);
  }
  // No breadcrumbs anywhere on the flat pages, the home page or a 404
  // (GOV.UK: none on a site with a flat structure; task 149).
  for (const path of [
    "/o-projekcie",
    "/prywatnosc",
    "/dostepnosc",
    "/ulice",
    "/",
    "/nie-ma-takiej-strony",
    "/adres/9999999",
  ]) {
    if ((await main(path)).html.includes("govuk-breadcrumbs"))
      fail(path, "breadcrumbs");
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
    if (page.main.includes(warning(nr)) !== hint)
      fail(path, hint ? "no warning" : "a warning");
    // The h1 names a number the register has, never another (item 6).
    const h1 = hint ? "Krowica Sama" : `Krowica Sama ${nr}`;
    if (!page.main.includes(`<h1 class="govuk-heading-l">${h1}</h1>`))
      fail(path, `not the h1 „${h1}”`);
  }

  // Any value the register lacks, in the path or the query, on the address
  // page, /smieci and /woda: one warning, the whole place, never indexed;
  // the water calendar reads it the same way: the whole place (task 205).
  const calName = async (path) =>
    /\r\nX-WR-CALNAME:([^\r]*(?:\r\n [^\r]*)*)/
      .exec(await (await fetch(`${server.origin}${path}`)).text())?.[1]
      .replace(/\r\n /g, "");
  const wholeName = await calName(`${VILLAGE}/woda.ics`);
  const BAD = ["abc", "x", "-1", "44.0", "99999", "0", "50a", "+44"];
  for (const nr of BAD) {
    const value = encodeURIComponent(nr);
    for (const sub of ["", "/smieci", "/woda"]) {
      for (const path of [
        `${VILLAGE}${sub}?nr=${value}`,
        `${VILLAGE}${sub}/nr/${value}`,
      ]) {
        const page = await main(path);
        if (page.status !== 200) fail(path, `${page.status}, want 200`);
        if (!page.main.includes(warning(nr)))
          fail(path, `no warning for „${nr}”`);
        if (!/<meta name="robots" content="noindex/.test(page.html))
          fail(path, "indexable");
      }
    }
    const ics = `${VILLAGE}/woda.ics?nr=${value}`;
    const name = await calName(ics);
    if (!wholeName || name !== wholeName)
      fail(ics, `„${name}”, not the whole place's „${wholeName}”`);
  }
  // A number the register has: the page and the calendar both keep it.
  const good = await main(`${VILLAGE}/woda?nr=5`);
  if (good.main.includes("Nie znaleźliśmy"))
    fail(`${VILLAGE}/woda?nr=5`, "a warning for a known number");
  const goodName = await calName(`${VILLAGE}/woda.ics?nr=5`);
  if (!goodName?.includes("Dąbrowa 5"))
    fail(`${VILLAGE}/woda.ics?nr=5`, `„${goodName}”, not the number's`);
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
  const town = await notFoundAt(`${server.origin}/adres/0972447`);
  if (town) fail("/adres/0972447", town);

  if (process.env.SCREENSHOT_DIR) await shots(process.env.SCREENSHOT_DIR);
} finally {
  await closeRenderedPages();
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
        const crumbs = box(".govuk-breadcrumbs");
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
  "Modules: the hub (Śmieci, Woda, Pogoda, always, each with its meta line; no cards or lists, no calendar), /smieci (breadcrumbs, h1, calendar, PDF) and /woda (fallback).",
);
