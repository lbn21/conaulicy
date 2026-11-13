import assert from "node:assert/strict";
import { test } from "node:test";
import {
  copyCheckedAt as copy,
  derived1809,
  REAL_2026_10_24,
} from "./imgw-fixture.ts";
import { imgwCopyOf, POWIAT, shownWarnings, UNREADABLE } from "./imgw-shown.ts";
import { type Feed, feedFile, POWIATS, parseFeed } from "./imgw-warnings.ts";
import { IMGW_KEY, MAX_AGE_MS, nextChecks, STALE_MS } from "./live-status.ts";

const HOUR = 3_600_000;
const quiet = () => {};
const at = (iso: string) => Date.parse(iso);

// The derived 1809 warning (not real): level 1, 75%, 25 Oct 13:00-19:00.
const WIND =
  "Prognozuje się wystąpienie dość silnego wiatru o średniej prędkości do 35 km/h, w porywach do 75 km/h, z południa.";

// More 1809 warnings, from the real feed's first item.
function extra(
  id: string,
  stopien: string,
  od: string,
  doo: string,
): Feed["items"] {
  const [base] = JSON.parse(REAL_2026_10_24);
  return parseFeed(
    [
      {
        ...base,
        id,
        stopien,
        obowiazuje_od: od,
        obowiazuje_do: doo,
        teryt: ["1809"],
      },
    ],
    quiet,
  );
}

test("the warnings cover our one powiat, 1809, from our gminas", () => {
  assert.deepEqual([...POWIATS], [POWIAT]);
  assert.equal(POWIAT, "1809");
});

test("one warning in force: IMGW's own words, its times", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  assert.deepEqual(shownWarnings(copy("2026-10-25T13:52:10+01:00"), now), {
    notice: null,
    warnings: [
      {
        id: "Sk20261024094213061",
        from: "2026-10-25T13:00:00+01:00",
        to: "2026-10-25T19:00:00+01:00",
        event: "Silny wiatr",
        level: 1,
        probability: 75,
        text: WIND,
      },
    ],
  });
});

test("to come and several: highest level first, then by start", () => {
  const evening = at("2026-10-24T20:00:00+02:00");
  const [soon] =
    shownWarnings(copy("2026-10-24T19:55:00+02:00"), evening)?.warnings ?? [];
  assert.equal(soon.from, "2026-10-25T13:00:00+01:00");
  const now = at("2026-10-25T14:00:00+01:00");
  const items = [
    ...extra("two", "2", "2026-10-25 10:00:00", "2026-10-25 21:00:00"),
    ...extra("three", "3", "2026-10-25 16:00:00", "2026-10-25 20:00:00"),
  ];
  const shown = shownWarnings(copy("2026-10-25T13:50:00+01:00", items), now);
  assert.deepEqual(
    shown?.warnings.map((w) => [w.id, w.level]),
    [
      ["three", 3],
      ["two", 2],
    ],
  );
});

test("the copy: the feed file and the last good check, never older than the feed", () => {
  const items = parseFeed(derived1809(), quiet);
  const feed = feedFile({ fetchedAt: "2026-10-25T12:00:00+01:00", items });
  const checks = (iso: string) =>
    JSON.stringify(nextChecks(null, { [IMGW_KEY]: true }, iso));
  // No feed file yet: nothing, whatever the status.
  assert.equal(imgwCopyOf(null, checks("2026-10-25T12:30:00+01:00")), null);
  // Checked since the feed was written: that check.
  assert.deepEqual(imgwCopyOf(feed, checks("2026-10-25T12:30:00+01:00")), {
    feed: { fetchedAt: "2026-10-25T12:00:00+01:00", items },
    checkedAt: at("2026-10-25T12:30:00+01:00"),
    // Its items last changed when the file was written.
    changedAt: at("2026-10-25T12:00:00+01:00"),
  });
  // No status file, an unreadable one, or one older than the feed: the
  // feed's own time.
  for (const status of [null, "{", checks("2026-10-25T11:00:00+01:00")])
    assert.equal(
      imgwCopyOf(feed, status)?.checkedAt,
      at("2026-10-25T12:00:00+01:00"),
    );
  // A feed file that is not one: thrown, never an empty copy.
  assert.throws(() => imgwCopyOf('{"version":2}', null), /IMGW feed file/);
  assert.throws(() => imgwCopyOf("not json", null));
});

test("stale over STALE_MS: the warnings with a notice first; too old from MAX_AGE_MS: the notice alone", () => {
  const checkedAt = "2026-10-25T12:00:00+01:00";
  const now = at(checkedAt);
  const fresh = shownWarnings(copy(checkedAt), now + STALE_MS);
  assert.equal(fresh?.notice, null);
  assert.equal(fresh?.warnings.length, 1);
  const stale = shownWarnings(copy(checkedAt), now + STALE_MS + 1);
  assert.equal(
    stale?.notice,
    "Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z 12:00.",
  );
  assert.equal(stale?.warnings.length, 1);
  assert.equal(
    shownWarnings(copy(checkedAt), now + MAX_AGE_MS - 1)?.warnings.length,
    1,
  );
  const old = shownWarnings(copy(checkedAt), now + MAX_AGE_MS);
  assert.deepEqual(
    [old?.notice, old?.warnings],
    [
      "Od 12:00 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.",
      [],
    ],
  );
});

test("stale or too old without any warning: still the notice, never nothing", () => {
  const checkedAt = "2026-10-25T12:00:00+01:00";
  const none = copy(checkedAt, []);
  assert.equal(shownWarnings(none, at(checkedAt) + STALE_MS), null);
  const stale = shownWarnings(none, at(checkedAt) + STALE_MS + 1);
  assert.deepEqual(
    [stale?.notice, stale?.warnings],
    [
      "Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z 12:00.",
      [],
    ],
  );
  // Days later: the day too.
  const later = shownWarnings(none, at(checkedAt) + 26 * HOUR);
  assert.equal(
    later?.notice,
    "Od niedzieli 25 października, 12:00 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.",
  );
  // A warning over, the copy stale: the notice, without it.
  const end = at("2026-10-25T19:00:00+01:00");
  const over = shownWarnings(copy("2026-10-25T17:30:00+01:00"), end);
  assert.deepEqual([over?.warnings.length, !!over?.notice], [0, true]);
});

test("nothing to show: no copy, or a fresh one with no warning for 1809, or every one over", () => {
  const fetchedAt = "2026-10-25T18:55:00+01:00";
  assert.equal(shownWarnings(null, at(fetchedAt)), null);
  const real = parseFeed(JSON.parse(REAL_2026_10_24), quiet);
  assert.equal(shownWarnings(copy(fetchedAt, real), at(fetchedAt)), null);
  assert.equal(shownWarnings(copy(fetchedAt, []), at(fetchedAt)), null);
  const end = at("2026-10-25T19:00:00+01:00");
  assert.equal(shownWarnings(copy(fetchedAt), end - 1)?.warnings.length, 1);
  assert.equal(shownWarnings(copy(fetchedAt), end), null);
});

test("the store unreadable now: the notice alone, never nothing", () => {
  const shown = shownWarnings(UNREADABLE, at("2026-10-25T12:00:00+01:00"));
  assert.deepEqual(shown, {
    notice: "Nie udało się teraz sprawdzić ostrzeżeń IMGW.",
    warnings: [],
  });
});
