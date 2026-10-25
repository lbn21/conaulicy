import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine } from "./hub.ts";
import { banner } from "./imgw-banner.ts";
import { derived1809, NO_WARNINGS_2026_10_18 } from "./imgw-fixture.ts";
import { type Feed, parseFeed } from "./imgw-warnings.ts";
import {
  weather,
  weatherAlerts,
  weatherChecked,
  weatherSources,
  weatherSummary,
} from "./weather-module.ts";

const quiet = () => {};
const at = (iso: string) => Date.parse(iso);

// The derived 1809 warning (not real): level 1, 25 Oct 13:00-19:00.
const copy = (
  fetchedAt: string,
  items = parseFeed(derived1809(), quiet),
  stale = false,
) => ({ feed: { fetchedAt, items } satisfies Feed, stale });

const none = parseFeed(JSON.parse(NO_WARNINGS_2026_10_18), quiet);

test("a warning: one alert with an absolute date, a card, its source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00"), now);
  assert.ok(data);
  assert.deepEqual(weatherAlerts(data), [
    {
      text: "Silny wiatr, stopień 1 z 3. Obowiązuje teraz, do niedzieli 25 października, 19:00.",
      href: "https://meteo.imgw.pl/",
      short: "IMGW-PIB",
      from: "2026-10-25T13:00:00+01:00",
    },
  ]);
  assert.deepEqual(weatherSummary(data), [
    ["Silny wiatr", ["Stopień 1 z 3, do niedzieli 25 października, 19:00"]],
    ["Gdzie", ["cały powiat lubaczowski"]],
  ]);
  assert.deepEqual(weatherSources(data), [
    [
      { href: "https://meteo.imgw.pl/", text: "IMGW-PIB" },
      ", sprawdzono 25 października 2026, 13:52",
    ],
  ]);
});

test("the same warnings as the banner, from the same copy", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const found = copy("2026-10-25T13:52:10+01:00");
  const data = weather(found, now);
  assert.deepEqual(data?.banner, banner(found, now));
});

test("no warning: no alert, no card („Bez zapowiedzi”), still a source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00", none), now);
  assert.ok(data);
  assert.deepEqual(weatherAlerts(data), []);
  assert.equal(weatherSummary(data), null);
  assert.equal(weatherSources(data).length, 1);
});

test("no copy, or 3 hours old: the weather is left out", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  assert.equal(weather(null, now), null);
  assert.equal(weather(copy("2026-10-25T11:00:00+01:00"), now), null);
  assert.ok(weather(copy("2026-10-25T11:00:01+01:00"), now));
});

test("a stale copy says so in its source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:00:00+01:00", undefined, true), now);
  assert.ok(data);
  assert.equal(
    weatherSources(data)[0].at(-1),
    ". Nowszych danych nie udało się pobrać",
  );
});

test("checked line: the copy's fetchedAt, warning or not", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  for (const items of [undefined, none]) {
    const data = weather(copy("2026-10-25T13:52:10+01:00", items), now);
    assert.ok(data);
    assert.equal(
      weatherChecked(data).getTime(),
      at("2026-10-25T13:52:10+01:00"),
    );
    assert.equal(
      checkedLine(weatherChecked(data)),
      "Ostatnio sprawdziliśmy: 25 października, 13:52",
    );
  }
});
