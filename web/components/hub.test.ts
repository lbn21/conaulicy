import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyCheckedAt } from "../lib/imgw-fixture.ts";
import type { PlaceView } from "../lib/schedule.ts";
import {
  CHECKED,
  NOW,
  POST_39885,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import { type Water, water } from "../lib/water-module.ts";
import { type Weather, weather } from "../lib/weather-module.ts";
import { zukView } from "../lib/zuk-data.ts";
import { Hub } from "./hub.tsx";
import { WarsawToday } from "./warsaw-today.tsx";

// The address page (components/hub.tsx Hub) as HubMain renders it, for the
// server's Warsaw day, at the water fixture's NOW (Sunday 25 Oct 2026, 13:30
// in Warsaw): the notices, a card per IMGW warning, the
// timeline („Najbliższe 7 dni”, then „Później”), „Wszystko o Twoim
// adresie” and the small print at the end.

const page = (
  place: PlaceView,
  cuts: Water | null = null,
  warnings: Weather | null = null,
) => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    return renderToStaticMarkup(
      createElement(
        WarsawToday,
        { day: place.today },
        createElement(Hub, { data: [place, cuts, warnings], place }),
      ),
    );
  } finally {
    mock.timers.reset();
  }
};

const count = (html: string, text: string) => html.split(text).length - 1;
/** The text of each `<tag>` in the html, tags stripped. */
const texts = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, "g"))].map(
    (m) => m[1].replace(/<[^>]+>/g, ""),
  );
/** The section labelled by `id`. */
/** The small print, the page's last paragraph, as html. */
const smallPrintHtml = (html: string) =>
  /<p class="govuk-hint govuk-!-font-size-16">((?:(?!<\/p>).)*)<\/p><\/div><\/div>$/.exec(
    html,
  )?.[1] ?? "";
/** The small print's text, tags stripped. */
const smallPrint = (html: string) =>
  smallPrintHtml(html).replace(/<[^>]+>/g, "");
const section = (html: string, id: string) =>
  new RegExp(`<section aria-labelledby="${id}">.*?</section>`).exec(
    html,
  )?.[0] ?? "";

// A village with two cuts (39885: Lisie Jamy, 26 and 29 Oct) and the
// derived IMGW warning in force (25 Oct 13:00-19:00), no waste schedule.
const VILLAGE = testPlace({
  id: "0606257",
  kind: "wies",
  name: "Smolińce",
  label: "Smolińce",
  group: "0606257",
  gmina: "Lubaczów (gmina)",
  localityId: "0606257",
  streetId: null,
});
const CUTS = water(
  {
    "gmina-lubaczow": zukView(
      zukFile([storedPost(POST_39885, CHECKED)], CHECKED),
      NOW,
    ),
  },
  VILLAGE,
);
const WARNINGS = weather(
  copyCheckedAt("2026-10-25T13:20:00+01:00"),
  NOW.getTime(),
);

// A street with a waste schedule and its source.
const SOURCE = {
  url: "https://example.org/harmonogram.pdf",
  label: "sektor 1",
  checkedAt: "2026-10-20",
  seenAt: null,
};
const pickup = (label: string, putOutBy: string | null = null) => ({
  id: label.toLowerCase(),
  subtype: label.toLowerCase(),
  label,
  putOutBy,
  shiftedFrom: null,
});
const STREET = testPlace({
  id: "0000001-00001",
  name: "ul. Próbna",
  label: "ul. Próbna, Wzorowo",
  area: "Wzorowo",
  group: "0000001",
  gmina: "Wzorowo",
  localityId: "0000001",
  streetId: "0000001-00001",
  zoneId: "waste:sektor-1",
  schedulePage: "https://example.org/harmonogram",
  sources: [SOURCE],
  fractions: ["papier", "szkło", "bio"],
  days: [
    { date: "2026-10-27", pickups: [pickup("Papier", "06:00")] },
    { date: "2026-11-03", pickups: [pickup("Szkło")] },
    { date: "2026-11-10", pickups: [pickup("Bio")] },
  ],
});

test("timeline: a card per day from today, 2+ empty days as one, Intl's titles", () => {
  assert.ok(WARNINGS);
  const html = page(VILLAGE, CUTS, WARNINGS);
  const timeline = section(html, "najblizsze-dni");
  assert.match(
    timeline,
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe 7 dni<\/h2><ol class="app-timeline">/,
  );
  // 25-31 Oct: today, the cut on 26, 27-28 empty, the cut on 29, 30-31
  // empty; nothing after the window, so no „Później”.
  assert.deepEqual(texts(timeline, "h3"), [
    "Niedziela, 25 października ·\u00a0dzisiaj",
    "Poniedziałek, 26 października ·\u00a0jutro",
    "27–28 października",
    "Czwartek, 29 października ·\u00a0za\u00a04\u00a0dni",
    "30–31 października",
  ]);
  assert.equal(count(timeline, "<li"), 5);
  // No class marks today: the first dot is CSS's (li:first-child).
  assert.doesNotMatch(timeline, /app-timeline__today/);
  assert.equal(
    count(timeline, '<li class="app-timeline__empty app-timeline__range">'),
    2,
  );
  // No waste schedule here, and an empty day still says just that;
  // today has only the warning, which is a card, not a row.
  assert.equal(count(timeline, "Nic nie zaplanowano."), 3);
  assert.doesNotMatch(timeline, /Później/);
});

test("timeline: each cut once, its row, „Szczegóły” to its subpage; no warning", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  const timeline = section(html, "najblizsze-dni");
  assert.equal(count(html, "nie będzie wody"), 2);
  assert.equal(count(html, "Cała wieś Lisie Jamy."), 2);
  assert.match(
    html,
    /<dt class="govuk-summary-list__key">Woda<\/dt><dd class="govuk-summary-list__value"><p class="govuk-body-s govuk-!-margin-bottom-0">Od 8:00 do 16:00 nie będzie wody\.<\/p><p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">Cała wieś Lisie Jamy\.<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0606257\/woda">Szczegóły<span class="govuk-visually-hidden"> o przerwie w dostawie wody, poniedziałek, 26 października<\/span><\/a><\/dd>/,
  );
  // Warnings are cards above the timeline, never in it, and no tag at all.
  assert.doesNotMatch(timeline, /Ostrzeżenie IMGW|Silny wiatr|Stopień/);
  assert.doesNotMatch(html, /govuk-tag|\/pogoda/);
  // Every card's last row has no border under it.
  assert.equal(
    count(html, "govuk-summary-list__row--no-border"),
    count(html, '<dl class="govuk-summary-list'),
  );
});

test("a warning: its card above the timeline, the meter, when, IMGW's words", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  const card =
    /<section class="app-warning[^"]*"[^>]*>.*?<\/section>/.exec(html)?.[0] ??
    "";
  assert.equal(count(html, 'class="app-warning '), 1);
  assert.ok(html.indexOf(card) < html.indexOf("najblizsze-dni"));
  assert.match(
    card,
    /^<section class="app-warning app-warning--1" aria-labelledby="ostrzezenie-Sk20261024094213061"><p class="app-warning__level govuk-body-s govuk-!-font-weight-bold"><span class="app-warning__meter" aria-hidden="true"><span class="app-warning__on"><\/span><span><\/span><span><\/span><\/span>Stopień 1 z 3<\/p><div class="app-warning__body"><h2 id="ostrzezenie-Sk20261024094213061" class="govuk-heading-m govuk-!-margin-bottom-2">Silny wiatr<\/h2><p class="govuk-body">Trwa do 25 października 19:00\.<\/p><details class="govuk-details govuk-!-margin-bottom-0"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">Co przekazuje IMGW<\/span><\/summary><div class="govuk-details__text">Prognozuje się wystąpienie /,
  );
  // No source, issue or check time in the card: the small print has them.
  assert.doesNotMatch(card, /IMGW-PIB|Źródło|Sprawdziliśmy|opublikowa/i);
});

test("several warnings: highest level first, then the earliest; each its meter and when", () => {
  const [ours] = copyCheckedAt("2026-10-25T13:20:00+01:00").feed.items.filter(
    (item) => item.teryt.includes("1809"),
  );
  const later = "2026-10-25T16:00:00+01:00";
  const items = [
    { ...ours, id: "a", level: 1 as const },
    { ...ours, id: "b", level: 3 as const, validFrom: later },
    { ...ours, id: "c", level: 3 as const },
    { ...ours, id: "d", level: 2 as const },
  ];
  const html = page(
    VILLAGE,
    CUTS,
    weather(copyCheckedAt("2026-10-25T13:20:00+01:00", items), NOW.getTime()),
  );
  const cards = [
    ...html.matchAll(
      /<section class="app-warning app-warning--(\d)" aria-labelledby="ostrzezenie-(\w)">(.*?)<\/section>/g,
    ),
  ];
  assert.deepEqual(
    cards.map(([, level, id]) => `${id}${level}`),
    ["c3", "b3", "d2", "a1"],
  );
  for (const [, level, , card] of cards) {
    assert.equal(count(card, "app-warning__on"), Number(level));
    assert.match(card, new RegExp(`Stopień ${level} z 3`));
  }
  // Begun: until when; to come: Intl's range.
  const when = cards.map(([, , , card]) =>
    /<p class="govuk-body">([^<]*)<\/p>/.exec(card)?.[1].replace(/\s/g, " "),
  );
  assert.deepEqual(when, [
    "Trwa do 25 października 19:00.",
    "Od 25 października, 16:00 do 19:00.",
    "Trwa do 25 października 19:00.",
    "Trwa do 25 października 19:00.",
  ]);
});

test("no warning: no card and nothing in its place", () => {
  const none = weather(
    copyCheckedAt("2026-10-25T13:20:00+01:00", []),
    NOW.getTime(),
  );
  const html = page(VILLAGE, CUTS, none);
  assert.doesNotMatch(html, /app-warning/);
  assert.match(html, /<\/div><section aria-labelledby="najblizsze-dni">/);
});

test("„Wszystko o Twoim adresie” and the small print: a link per module with a source, then the checks and IMGW's words", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  // The weather has no subpage: no link for it.
  assert.deepEqual(texts(section(html, "wszystko"), "li"), [
    "Wszystkie przerwy w wodzie",
  ]);
  // No waste check here: waste is left out of the freshness line.
  assert.match(
    smallPrint(html),
    /^Sprawdziliśmy: woda [^,]+ i pogoda 25 października 13:20\. Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy\. Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone\.$/,
  );
  // The weather has no subpage: its source link is IMGW's name here.
  assert.match(
    smallPrintHtml(html),
    / jest <a class="govuk-link" href="https:\/\/meteo\.imgw\.pl\/">Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy<\/a>\. Dane /,
  );
  // The other sources are on the subpages, none on the hub.
  assert.doesNotMatch(html, /Źródło:|Skąd to wiemy/);
  // IMGW's required wording, once.
  assert.equal(count(html, "Instytut Meteorologii i Gospodarki Wodnej"), 1);
});

test("no waste source: why, in the notices; no waste link, meta line or row", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">Nie mamy jeszcze harmonogramu wywozu śmieci dla tej wsi\. Sprawdź odbiory w harmonogramie [^<]+\.<\/p><\/div><section class="app-warning /,
  );
  assert.doesNotMatch(html, /Wszystkie odbiory śmieci|Śmieci|\/smieci/);
});

test("a live module not checked says so; nothing is claimed for it", () => {
  const html = page(VILLAGE);
  assert.match(
    html,
    /<div class="govuk-inset-text">.*<p class="govuk-body">Nie udało się sprawdzić przerw w dostawie wody\.<\/p><p class="govuk-body">Nie udało się sprawdzić ostrzeżeń IMGW\.<\/p><\/div>/,
  );
  assert.doesNotMatch(html, /Wszystkie przerwy w wodzie|Ostrzeżenia pogodowe/);
});

test("nothing in the window and nothing later: one line, no cards; the links and small print stay", () => {
  // A street with its waste source but no dates left; water and weather
  // not checked (their notices say so).
  const html = page(testPlace({ ...STREET, days: [] }));
  assert.equal(
    section(html, "najblizsze-dni"),
    '<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe 7 dni</h2><p class="govuk-body">Na razie nic nie zaplanowano pod tym adresem.</p></section>',
  );
  assert.doesNotMatch(html, /app-timeline|Nic nie zaplanowano\.|Później/);
  assert.match(section(html, "wszystko"), />Wszystkie odbiory śmieci<\/a>/);
  assert.match(smallPrint(html), /^Sprawdziliśmy: śmieci 20 października/);
  // Not checked is never „nothing”: the notice says so, above the line.
  assert.ok(
    html.indexOf("Nie udało się sprawdzić przerw w dostawie wody") <
      html.indexOf("Na razie nic nie zaplanowano"),
  );
});

test("a split street without a number: „Podaj numer domu” above the timeline", () => {
  const html = page(
    testPlace({ ...STREET, askNumber: true, zoneId: null, sources: [] }),
  );
  assert.match(html, />Podaj numer domu<\/a>/);
  assert.ok(html.indexOf("Podaj numer domu") < html.indexOf("najblizsze-dni"));
});

test("waste: its pickups by day; in the window, so no „Później” for it", () => {
  const html = page(STREET);
  const timeline = section(html, "najblizsze-dni");
  assert.deepEqual(texts(timeline, "h3"), [
    // An empty today and tomorrow: one run.
    "25–26 października",
    "Wtorek, 27 października ·\u00a0pojutrze",
    "28–31 października",
  ]);
  assert.doesNotMatch(html, /Później|app-timeline__later/);
  assert.match(
    timeline,
    /<dt class="govuk-summary-list__key">Śmieci<\/dt><dd class="govuk-summary-list__value">.*?Papier.*?<p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">Wystaw je do 6:00 rano\.<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0000001-00001\/smieci">Szczegóły<span class="govuk-visually-hidden"> o odbiorze śmieci, wtorek, 27 października<\/span>/,
  );
});

test("waste only after the window: „Później”, its next pickup with its year", () => {
  const html = page(testPlace({ ...STREET, days: STREET.days.slice(1) }));
  const timeline = section(html, "najblizsze-dni");
  assert.deepEqual(texts(timeline, "h3"), ["25–31 października", "Później"]);
  // „Później”: only the next pickup after the window, its date the value.
  const later = /<li class="app-timeline__later">.*?<\/li>/.exec(timeline)?.[0];
  assert.ok(later);
  assert.match(
    later,
    /<dt class="govuk-summary-list__key">Śmieci<\/dt><dd class="govuk-summary-list__value">Wtorek, 3 listopada 2026<\/dd>/,
  );
  assert.doesNotMatch(later, /10 listopada/);
  // The waste subpage's link and its check in the small print.
  assert.match(
    section(html, "wszystko"),
    /<a class="govuk-link" href="\/adres\/0000001-00001\/smieci">Wszystkie odbiory śmieci<\/a>/,
  );
  assert.match(
    smallPrint(html),
    /^Sprawdziliśmy: śmieci 20 października\. Źródłem /,
  );
  // Dates not checked yet: the AI caveat after the checks.
  assert.match(
    smallPrint(page({ ...STREET, verified: false })),
    /^Sprawdziliśmy: śmieci 20 października\. Daty przepisał program – jeśli coś się nie zgadza, ważniejszy jest harmonogram\. Źródłem /,
  );
});

test("a house number given: every subpage link keeps it", () => {
  const html = page(testPlace({ ...STREET, givenNr: "12a" }));
  assert.match(html, /href="\/adres\/0000001-00001\/smieci\?nr=12a">Szczegóły/);
  assert.match(
    html,
    /href="\/adres\/0000001-00001\/smieci\?nr=12a">Wszystkie odbiory śmieci/,
  );
});
