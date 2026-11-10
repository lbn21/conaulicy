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
// in Warsaw): the notices, the timeline („Najbliższe 7 dni”, then
// „Później”), „Wszystko o Twoim adresie” and „Skąd to wiemy”.

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
  // No waste schedule here, and an empty day still says just that (task 278).
  assert.equal(count(timeline, "Nic nie zaplanowano."), 2);
  assert.doesNotMatch(timeline, /Później/);
});

test("timeline: each cut and warning once, its row, „Szczegóły” to its subpage", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  assert.equal(count(html, "nie będzie wody"), 2);
  assert.equal(count(html, "Cała wieś Lisie Jamy."), 2);
  assert.equal(count(html, 'class="govuk-tag '), 1);
  assert.match(
    html,
    /<dt class="govuk-summary-list__key">Ostrzeżenie IMGW<\/dt><dd class="govuk-summary-list__value"><p class="govuk-body-s govuk-!-margin-bottom-0"><strong class="govuk-tag govuk-tag--yellow">Stopień 1 z 3<\/strong> Silny wiatr, od 13:00 do 19:00\.<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0606257\/pogoda">Szczegóły<span class="govuk-visually-hidden"> o ostrzeżeniu IMGW, niedziela, 25 października<\/span><\/a><\/dd>/,
  );
  assert.match(
    html,
    /<dt class="govuk-summary-list__key">Woda<\/dt><dd class="govuk-summary-list__value"><p class="govuk-body-s govuk-!-margin-bottom-0">Od 8:00 do 16:00 nie będzie wody\.<\/p><p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">Cała wieś Lisie Jamy\.<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0606257\/woda">Szczegóły<span class="govuk-visually-hidden"> o przerwie w dostawie wody, poniedziałek, 26 października<\/span><\/a><\/dd>/,
  );
  // IMGW's own description is /pogoda's alone.
  assert.doesNotMatch(html, /Prawdopodobieństwo|Prognozuje się/);
  // Every card's last row has no border under it.
  assert.equal(
    count(html, "govuk-summary-list__row--no-border"),
    count(html, '<dl class="govuk-summary-list'),
  );
});

test("„Wszystko o Twoim adresie” and „Skąd to wiemy”: a link and a meta line per module with a source", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  assert.deepEqual(texts(section(html, "wszystko"), "li"), [
    "Wszystkie przerwy w wodzie",
    "Ostrzeżenia pogodowe IMGW",
  ]);
  assert.match(
    section(html, "wszystko"),
    /href="\/adres\/0606257\/woda">.*href="\/adres\/0606257\/pogoda">/,
  );
  const known = section(html, "skad-to-wiemy");
  assert.deepEqual(texts(known, "strong"), ["Woda.", "Pogoda."]);
  assert.match(
    known,
    /<strong>Pogoda\.<\/strong> Źródło: <a [^>]*href="https:\/\/meteo\.imgw\.pl\/"[^>]*>IMGW-PIB<\/a>\. Sprawdziliśmy 25 października 13:20\.<\/p>/,
  );
  // IMGW's required wording, once.
  assert.equal(count(html, "Instytut Meteorologii i Gospodarki Wodnej"), 1);
});

test("no waste source: why, in the notices; no waste link, meta line or row", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">Nie mamy jeszcze harmonogramu wywozu śmieci dla tej wsi\. Sprawdź odbiory w harmonogramie [^<]+\.<\/p><\/div><section aria-labelledby="najblizsze-dni">/,
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
  // With nothing at all: the whole window, today included, one run.
  assert.deepEqual(texts(section(html, "najblizsze-dni"), "h3"), [
    "25–31 października",
  ]);
  assert.match(
    html,
    /<ol class="app-timeline"><li class="app-timeline__empty app-timeline__range"><div class="app-timeline__card app-timeline__card--empty">/,
  );
});

test("a split street without a number: „Podaj numer domu” above the timeline", () => {
  const html = page(
    testPlace({ ...STREET, askNumber: true, zoneId: null, sources: [] }),
  );
  assert.match(html, />Podaj numer domu<\/a>/);
  assert.ok(html.indexOf("Podaj numer domu") < html.indexOf("najblizsze-dni"));
});

test("waste: its pickups by day, „Później” the next one per module with its year", () => {
  const html = page(STREET);
  const timeline = section(html, "najblizsze-dni");
  assert.deepEqual(texts(timeline, "h3"), [
    // An empty today and tomorrow: one run (task 272).
    "25–26 października",
    "Wtorek, 27 października ·\u00a0pojutrze",
    "28–31 października",
    "Później",
  ]);
  assert.match(
    timeline,
    /<dt class="govuk-summary-list__key">Śmieci<\/dt><dd class="govuk-summary-list__value">.*?Papier.*?<p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">Wystaw je do 6:00 rano\.<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0000001-00001\/smieci">Szczegóły<span class="govuk-visually-hidden"> o odbiorze śmieci, wtorek, 27 października<\/span>/,
  );
  // „Później”: only the next pickup after the window, its date the value.
  const later = /<li class="app-timeline__later">.*?<\/li>/.exec(timeline)?.[0];
  assert.ok(later);
  assert.match(
    later,
    /<dt class="govuk-summary-list__key">Śmieci<\/dt><dd class="govuk-summary-list__value">Wtorek, 3 listopada 2026<\/dd>/,
  );
  assert.doesNotMatch(later, /10 listopada/);
  // The waste subpage's link and its meta line.
  assert.match(
    section(html, "wszystko"),
    /<a class="govuk-link" href="\/adres\/0000001-00001\/smieci">Wszystkie odbiory śmieci<\/a>/,
  );
  assert.match(
    section(html, "skad-to-wiemy"),
    /<strong>Śmieci\.<\/strong> Źródło: <a [^>]*href="https:\/\/example\.org\/harmonogram\.pdf"[^>]*>[^<]+<\/a>, sektor 1\. Sprawdziliśmy 20 października\.<\/p>/,
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
