import assert from "node:assert/strict";
import { test } from "node:test";
import { copyAt as copy, NO_WARNINGS_2026_10_18 } from "./imgw-fixture.ts";
import { shownWarnings, UNREADABLE } from "./imgw-shown.ts";
import { parseFeed } from "./imgw-warnings.ts";
import { warningWhen, weather, weatherNotices } from "./weather-module.ts";

const at = (iso: string) => Date.parse(iso);
const none = parseFeed(JSON.parse(NO_WARNINGS_2026_10_18), () => {});

// Intl's spaces may be thin or no-break ones: compared as plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

test("a warning: its card's data, IMGW's words; no notice on the hub", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00"), now);
  assert.ok(data);
  const [warning, ...rest] = data.shown?.warnings ?? [];
  assert.deepEqual(rest, []);
  assert.equal(warning.event, "Silny wiatr");
  assert.equal(warning.level, 1);
  assert.equal(warning.from, "2026-10-25T13:00:00+01:00");
  assert.equal(warning.to, "2026-10-25T19:00:00+01:00");
  assert.match(warning.text, /^Prognozuje się wystąpienie/);
  assert.deepEqual(weatherNotices(data), []);
});

test("its card's when: „Trwa do …” once begun, else Intl's range as „Od … do …”", () => {
  const data = weather(
    copy("2026-10-25T13:52:10+01:00"),
    at("2026-10-25T12:00:00+01:00"),
  );
  const [warning] = data?.shown?.warnings ?? [];
  const when = (now: string) => plain(warningWhen(warning, at(now)));
  assert.equal(
    when("2026-10-25T14:00:00+01:00"),
    "Trwa do 25 października, 19:00.",
  );
  assert.equal(
    when("2026-10-25T13:00:00+01:00"),
    "Trwa do 25 października, 19:00.",
  );
  assert.equal(
    when("2026-10-25T12:59:59+01:00"),
    "Od 25 października, 13:00 do 19:00.",
  );
  // Across midnight: both days, as Intl's range gives them.
  const night = {
    ...warning,
    from: "2026-11-11T22:00:00+01:00",
    to: "2026-11-12T04:00:00+01:00",
  };
  assert.equal(
    plain(warningWhen(night, at("2026-11-11T12:00:00+01:00"))),
    "Od 11 listopada, 22:00 do 12 listopada, 4:00.",
  );
  assert.equal(
    plain(warningWhen(night, at("2026-11-11T23:00:00+01:00"))),
    "Trwa do 12 listopada, 4:00.",
  );
});

test("the cards' warnings: shownWarnings of the same copy", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const found = copy("2026-10-25T13:52:10+01:00");
  const data = weather(found, now);
  assert.deepEqual(data?.shown, shownWarnings(found, now));
});

test("no warning: no card, no notice", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T13:52:10+01:00", none), now);
  assert.ok(data);
  assert.equal(data.shown, null);
  assert.deepEqual(weatherNotices(data), []);
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

test("IMGW's checks failing: the notice, linked to IMGW, and the warnings still shown", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const failing = "2026-10-25T12:59:59+01:00";
  const data = weather(
    copy("2026-10-25T12:00:00+01:00", undefined, failing),
    now,
  );
  assert.ok(data);
  const [[notice]] = weatherNotices(data);
  assert.match(String(notice[0]), /12:59/);
  assert.ok(String(notice[0]).endsWith(NOTICE_END));
  assert.deepEqual(notice.slice(1), [link, "."]);
  assert.equal(data.shown?.warnings.length, 1);
  assert.equal(data.read, true);
  // No warning: the notice alone, never „Brak ostrzeżeń”.
  const none = weather(copy("2026-10-25T12:00:00+01:00", [], failing), now);
  assert.ok(none);
  assert.equal(none.shown?.warnings.length, 0);
  assert.ok(none.shown?.notice);
});

test("an old copy, IMGW's checks going well: its warnings, no notice", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const data = weather(copy("2026-10-25T08:00:00+01:00"), now);
  assert.ok(data);
  assert.equal(data.shown?.warnings.length, 1);
  assert.deepEqual(weatherNotices(data), []);
});

test("change time: when IMGW's items last changed, warning or not", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  for (const items of [undefined, none]) {
    const data = weather(copy("2026-10-25T13:52:10+01:00", items), now);
    assert.ok(data);
    assert.equal(data.changedAt, at("2026-10-25T13:52:10+01:00"));
  }
});

test("the store unreadable now: the notice alone, no card, no check time", () => {
  const data = weather(UNREADABLE, at("2026-10-25T14:00:00+01:00"));
  assert.ok(data);
  assert.deepEqual(data.shown?.warnings, []);
  assert.deepEqual(weatherNotices(data), [
    [[`Nie udało się nam sprawdzić ostrzeżeń IMGW.${NOTICE_END}`, link, "."]],
  ]);
  assert.equal(data.read, false);
  assert.equal(data.changedAt, null);
});
