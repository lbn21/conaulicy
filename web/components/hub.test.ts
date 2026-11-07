import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { todayInWarsaw } from "../lib/dates.ts";
import { copyCheckedAt } from "../lib/imgw-fixture.ts";
import { MODULES, type Module } from "../lib/modules.ts";
import { ordered } from "../lib/upcoming.ts";
import {
  CHECKED,
  NOW,
  POST_39885,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import { water, waterUpcoming } from "../lib/water-module.ts";
import { weather, weatherUpcoming } from "../lib/weather-module.ts";
import { zukView } from "../lib/zuk-data.ts";
import { ModuleBody, ModuleSection } from "./hub.tsx";
import { Upcoming } from "./upcoming.tsx";
import { WarsawToday } from "./warsaw-today.tsx";

// A hub section (components/hub.tsx) as the address page renders it, for a
// made-up place: with no source, no subpage link and no meta line.
const PLACE = {
  id: "0000001-00001",
  name: "ul. Próbna",
  label: "ul. Próbna, Wzorowo",
  area: "Wzorowo",
  group: "0000001",
  gmina: "Wzorowo",
  localityId: "0000001",
  streetId: "0000001-00001",
};
const SCHEDULE = "https://example.org/harmonogram";
const SOURCE = {
  url: "https://example.org/harmonogram.pdf",
  label: "sektor 1",
  checkedAt: "2026-10-20",
  seenAt: null,
};

const section = (place: Parameters<typeof testPlace>[0]) => {
  const data = testPlace({ ...PLACE, schedulePage: SCHEDULE, ...place });
  return renderToStaticMarkup(
    createElement(
      ModuleSection,
      { module: MODULES.smieci },
      createElement(ModuleBody, {
        loaded: { module: MODULES.smieci, data },
        place: data,
      }),
    ),
  );
};

test("hub section: no source, no „Źródło: .”, no subpage link, no empty line", () => {
  const html = section({ zoneId: null, sources: [] });
  assert.doesNotMatch(html, /Źródło/);
  assert.doesNotMatch(html, /Wszystkie odbiory śmieci/);
  assert.doesNotMatch(html, /<p class="govuk-body-s">/);
  // The status and the link to the schedule stay.
  assert.match(html, new RegExp(`href="${SCHEDULE}"`));
  assert.match(html, /<\/h2><p class="govuk-body">[^<]+ /);
});

test("hub section: a split street without a number keeps „Podaj numer domu”", () => {
  const html = section({ askNumber: true, zoneId: null, sources: [] });
  assert.match(html, />Podaj numer domu<\/a>/);
});

test("hub section: with a source, its subpage link, then the meta line", () => {
  const html = section({ zoneId: "waste:sektor-1", sources: [SOURCE] });
  assert.match(
    html,
    /<p class="govuk-body"><a class="govuk-link" href="\/adres\/[^"]+\/smieci">Wszystkie odbiory śmieci<\/a><\/p><p class="govuk-body-s">Źródło: <a [^>]*href="https:\/\/example\.org\/harmonogram\.pdf"[^>]*>[^<]+<\/a>, sektor 1\. Sprawdziliśmy 20 października\.<\/p><\/section>$/,
  );
});

// The address page's „Najbliższe dni” and its Woda and Pogoda sections, as
// the hub renders them (components/hub.tsx Hub), for a village with two
// cuts (39885: Lisie Jamy, 26 and 29 Oct) and the derived IMGW warning in
// force (25 Oct 13:00-19:00) at NOW (Sunday 25 Oct, 13:30 in Warsaw).
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
const WIND =
  "Prognozuje się wystąpienie dość silnego wiatru o średniej prędkości do 35 km/h, w porywach do 75 km/h, z południa.";

const count = (html: string, text: string) => html.split(text).length - 1;

/** Each module's section, as Hub draws it, `data` its loaded data. */
const body = <D>(module: Module<D>, data: D) =>
  renderToStaticMarkup(
    createElement(
      ModuleSection,
      { module: module as Module<unknown> },
      createElement(ModuleBody, {
        loaded: { module: module as Module<unknown>, data },
        place: VILLAGE,
      }),
    ),
  );

test("address page: each cut and warning once, in „Najbliższe dni”; the sections add the rest (task 257)", () => {
  const now = NOW.getTime();
  const cuts = water(
    {
      "gmina-lubaczow": zukView(
        zukFile([storedPost(POST_39885, CHECKED)], CHECKED),
        NOW,
      ),
    },
    VILLAGE,
  );
  const warnings = weather(copyCheckedAt("2026-10-25T13:20:00+01:00"), now);
  assert.ok(warnings);
  assert.equal(cuts.outages.length, 2);
  assert.equal(warnings.shown?.warnings.length, 1);
  const list = renderToStaticMarkup(
    createElement(
      WarsawToday,
      { day: todayInWarsaw(NOW) },
      createElement(Upcoming, {
        items: ordered([...waterUpcoming(cuts), ...weatherUpcoming(warnings)]),
        now,
      }),
    ),
  );
  const woda = body(MODULES.woda, cuts);
  const pogoda = body(MODULES.pogoda, warnings);
  const page = list + woda + pogoda;
  // Every cut once, in the list; the Woda section only its link and source.
  assert.equal(count(list, "nie będzie wody"), 2);
  assert.equal(count(page, "nie będzie wody"), 2);
  assert.equal(count(page, "Cała wieś Lisie Jamy."), 2);
  assert.doesNotMatch(woda, /2[69] października|Gdzie:|Kolejne dni/);
  assert.match(
    woda,
    /<\/h2><p class="govuk-body"><a class="govuk-link" href="\/adres\/0606257\/woda">Wszystkie przerwy w wodzie<\/a><\/p><p class="govuk-body-s">Źródło: <a [^>]*>komunikat gminy z 23 października 2026<\/a>\. Sprawdziliśmy 25 października, 13:20\.<\/p><\/section>$/,
  );
  // The warning once, in the list (its tag, when); the Pogoda section
  // IMGW's own words, once, and IMGW's page.
  assert.equal(count(page, "ostrzeżenie IMGW – silny wiatr"), 1);
  assert.equal(count(page, 'class="govuk-tag '), 1);
  assert.equal(count(page, "19:00"), 1);
  assert.equal(count(page, WIND), 1);
  assert.equal(count(pogoda, "Prawdopodobieństwo: 75%."), 1);
  assert.match(
    pogoda,
    /<\/h2><p class="govuk-body govuk-!-margin-bottom-2">Silny wiatr, stopień 1 z 3<\/p><p class="govuk-body">Prognozuje się [^<]+ Prawdopodobieństwo: 75%\.<\/p><p class="govuk-body"><a [^>]*href="https:\/\/meteo\.imgw\.pl\/"[^>]*>Szczegóły i mapa na meteo\.imgw\.pl<\/a><\/p><p class="govuk-body-s">Źródło: <a [^>]*href="https:\/\/meteo\.imgw\.pl\/"[^>]*>IMGW-PIB<\/a>\. Sprawdziliśmy 25 października, 13:20\.<\/p><\/section>$/,
  );
});

test("address page: no warning, Pogoda says so once, no IMGW link but the source", () => {
  const none = weather(
    copyCheckedAt("2026-10-25T13:20:00+01:00", []),
    NOW.getTime(),
  );
  assert.ok(none);
  assert.deepEqual(weatherUpcoming(none), []);
  const pogoda = body(MODULES.pogoda, none);
  assert.equal(
    count(pogoda, "Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."),
    1,
  );
  assert.doesNotMatch(pogoda, /Szczegóły i mapa/);
  assert.match(pogoda, /Źródło: <a [^>]*>IMGW-PIB<\/a>/);
});
