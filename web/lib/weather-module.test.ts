import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine } from "./hub.ts";
import { banner } from "./imgw-banner.ts";
import { derived1809, NO_WARNINGS_2026_10_18 } from "./imgw-fixture.ts";
import { type Feed, parseFeed } from "./imgw-warnings.ts";
import {
  weather,
  weatherChecked,
  weatherSources,
  weatherStatus,
  weatherUpcoming,
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

test("a warning: one item, absolute lines with its tag, its source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00"), now);
  assert.ok(data);
  const tag = { tag: "govuk-tag govuk-tag--yellow", text: "Stopień 1 z 3" };
  assert.deepEqual(weatherUpcoming(data), [
    {
      module: "pogoda",
      span: {
        start: "2026-10-25T13:00:00+01:00",
        end: "2026-10-25T19:00:00+01:00",
        day: "2026-10-25",
        endDay: "2026-10-25",
        from: "13:00",
        to: "19:00",
        about: false,
        date: "niedziela, 25 października",
        until: "niedzieli 25 października",
      },
      shownFrom: null,
      event: "silny wiatr",
      level: tag,
      second: "Cały powiat.",
      secondUntil: null,
    },
  ]);
  // The same whether in force or to come: a cached copy stays true.
  assert.deepEqual(weatherStatus(data), [
    [
      ["Silny wiatr ", tag],
      [
        {
          day: "2026-10-25",
          text: "niedziela, 25 października, 13:00–19:00",
        },
      ],
      ["Gdzie: cały powiat lubaczowski"],
    ],
  ]);
  const before = weather(
    copy("2026-10-25T11:52:10+01:00"),
    at("2026-10-25T12:00:00+01:00"),
  );
  assert.ok(before);
  assert.deepEqual(weatherStatus(before), weatherStatus(data));
  assert.deepEqual(weatherSources(data), [
    [{ href: "https://meteo.imgw.pl/", text: "IMGW-PIB" }],
  ]);
});

test("the same warnings as the banner, from the same copy", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const found = copy("2026-10-25T13:52:10+01:00");
  const data = weather(found, now);
  assert.deepEqual(data?.banner, banner(found, now));
});

test("no warning: no alert, a line saying so, still a source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00", none), now);
  assert.ok(data);
  assert.deepEqual(weatherUpcoming(data), []);
  assert.deepEqual(weatherStatus(data), [
    [["Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."]],
  ]);
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
      checkedLine(weatherChecked(data), "pogoda"),
      "Ostatnio sprawdziliśmy: 25 października, 13:52",
    );
  }
});
