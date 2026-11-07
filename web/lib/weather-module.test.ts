import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine } from "./hub.ts";
import {
  copyCheckedAt as copy,
  NO_WARNINGS_2026_10_18,
} from "./imgw-fixture.ts";
import { shownWarnings, UNREADABLE } from "./imgw-shown.ts";
import { parseFeed } from "./imgw-warnings.ts";
import {
  weather,
  weatherChecked,
  weatherSources,
  weatherStatus,
  weatherUpcoming,
} from "./weather-module.ts";

const at = (iso: string) => Date.parse(iso);
const none = parseFeed(JSON.parse(NO_WARNINGS_2026_10_18), () => {});

const WIND =
  "Prognozuje się wystąpienie dość silnego wiatru o średniej prędkości do 35 km/h, w porywach do 75 km/h, z południa.";
const MORE = [
  [
    {
      href: "https://meteo.imgw.pl/",
      text: "Szczegóły i mapa na meteo.imgw.pl",
    },
  ],
];

test("a warning: one item with its tag and times; the section only IMGW's words", () => {
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
        since: "niedzieli 25 października",
        until: "niedzieli 25 października",
      },
      shownFrom: null,
      event: "silny wiatr",
      level: tag,
      second: "Cały powiat.",
      secondUntil: null,
    },
  ]);
  // The section: which warning, IMGW's description and probability, its
  // page; never its tag or times again (task 257). The same whether in
  // force or to come.
  assert.deepEqual(weatherStatus(data), [
    [["Silny wiatr, stopień 1 z 3"], [`${WIND} Prawdopodobieństwo: 75%.`]],
    MORE,
  ]);
  const said = JSON.stringify(weatherStatus(data));
  assert.doesNotMatch(said, /govuk-tag|13:00|19:00|października/);
  const before = weather(
    copy("2026-10-25T11:52:10+01:00"),
    at("2026-10-25T12:00:00+01:00"),
  );
  assert.ok(before);
  assert.deepEqual(weatherStatus(before), weatherStatus(data));
  assert.deepEqual(weatherSources(), [
    [{ href: "https://meteo.imgw.pl/", text: "IMGW-PIB" }],
  ]);
});

test("the same warnings in the list and the section, from the same copy", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const found = copy("2026-10-25T13:52:10+01:00");
  const data = weather(found, now);
  assert.deepEqual(data?.shown, shownWarnings(found, now));
});

test("no warning: no alert, a line saying so, still a source", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00", none), now);
  assert.ok(data);
  assert.deepEqual(weatherUpcoming(data), []);
  assert.deepEqual(weatherStatus(data), [
    [["Brak ostrzeżeń IMGW dla powiatu lubaczowskiego."]],
  ]);
  assert.equal(weatherSources().length, 1);
});

test("no copy yet: the weather is left out; any copy, however old, is shown", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  assert.equal(weather(null, now), null);
  for (const checkedAt of [
    "2026-10-25T11:00:00+01:00",
    "2026-10-20T11:00:00+01:00",
  ])
    assert.ok(weather(copy(checkedAt), now));
});

const NOTICE_END = " Aktualne znajdziesz na ";
const link = { href: "https://meteo.imgw.pl/", text: "meteo.imgw.pl" };

test("stale: the notice first, linked to IMGW, then the warnings", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T12:59:59+01:00"), now);
  assert.ok(data);
  const [notice, warnings] = weatherStatus(data);
  assert.deepEqual(notice, [
    [
      `Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z 12:59.${NOTICE_END}`,
      link,
      ".",
    ],
  ]);
  assert.deepEqual(warnings[0], ["Silny wiatr, stopień 1 z 3"]);
  assert.equal(weatherUpcoming(data).length, 1);
  assert.equal(
    weatherChecked(data)?.getTime(),
    at("2026-10-25T12:59:59+01:00"),
  );
  // No warning: the notice alone, never „Brak ostrzeżeń”.
  const none = weather(copy("2026-10-25T12:59:59+01:00", []), now);
  assert.ok(none);
  assert.deepEqual(weatherStatus(none), [
    [
      [
        `Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z 12:59.${NOTICE_END}`,
        link,
        ".",
      ],
    ],
  ]);
});

test("too old: the notice alone, no warning in the section or „Najbliższe dni”", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T11:00:00+01:00"), now);
  assert.ok(data);
  assert.deepEqual(weatherUpcoming(data), []);
  assert.deepEqual(weatherStatus(data), [
    [
      [
        `Od 11:00 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.${NOTICE_END}`,
        link,
        ".",
      ],
    ],
  ]);
});

test("checked line: the last good check, warning or not", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  for (const items of [undefined, none]) {
    const data = weather(copy("2026-10-25T13:52:10+01:00", items), now);
    assert.ok(data);
    assert.equal(
      weatherChecked(data)?.getTime(),
      at("2026-10-25T13:52:10+01:00"),
    );
    assert.equal(
      checkedLine(weatherChecked(data), "pogoda"),
      "Ostatnio sprawdziliśmy: 25 października, 13:52",
    );
  }
});

test("the store unreadable now: the notice alone, no item, no check time", () => {
  const data = weather(UNREADABLE, at("2026-10-25T14:00:00+01:00"));
  assert.ok(data);
  assert.deepEqual(weatherUpcoming(data), []);
  assert.deepEqual(weatherStatus(data), [
    [[`Nie udało się teraz sprawdzić ostrzeżeń IMGW.${NOTICE_END}`, link, "."]],
  ]);
  assert.equal(weatherChecked(data), null);
  assert.equal(checkedLine(weatherChecked(data), "pogoda"), null);
});
