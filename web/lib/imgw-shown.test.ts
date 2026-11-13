import assert from "node:assert/strict";
import { test } from "node:test";
import {
  copyAt as copy,
  derived1809,
  REAL_2026_10_24,
} from "./imgw-fixture.ts";
import { imgwCopyOf, POWIAT, shownWarnings, UNREADABLE } from "./imgw-shown.ts";
import { type Feed, feedFile, POWIATS, parseFeed } from "./imgw-warnings.ts";
import { IMGW_KEY, nextChecks } from "./live-status.ts";

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

test("the copy: the feed file as stored, and whether IMGW's checks fail", () => {
  const items = parseFeed(derived1809(), quiet);
  const feed = feedFile({ fetchedAt: "2026-10-25T12:00:00+01:00", items });
  const checks = (ok: boolean, iso: string) =>
    JSON.stringify(nextChecks(null, { [IMGW_KEY]: ok }, iso));
  // No feed file yet: nothing, whatever the status.
  assert.equal(
    imgwCopyOf(null, checks(true, "2026-10-25T12:30:00+01:00")),
    null,
  );
  assert.deepEqual(
    imgwCopyOf(feed, checks(true, "2026-10-25T12:30:00+01:00")),
    {
      feed: { fetchedAt: "2026-10-25T12:00:00+01:00", items },
      failingSince: null,
      // Its items last changed when the file was written.
      changedAt: at("2026-10-25T12:00:00+01:00"),
    },
  );
  // No status file, or an unreadable one: not failing.
  for (const status of [null, "{"])
    assert.equal(imgwCopyOf(feed, status)?.failingSince, null);
  assert.equal(
    imgwCopyOf(feed, checks(false, "2026-10-25T12:30:00+01:00"))?.failingSince,
    at("2026-10-25T12:30:00+01:00"),
  );
  // A feed file that is not one: thrown, never an empty copy.
  assert.throws(() => imgwCopyOf('{"version":2}', null), /IMGW feed file/);
  assert.throws(() => imgwCopyOf("not json", null));
});

test("the copy's warnings, whatever its age; IMGW's checks failing: the notice first, the warnings still shown", () => {
  const fetchedAt = "2026-10-25T12:00:00+01:00";
  // A warning in force at 18:00, the copy six hours old: shown, no notice.
  const evening = at("2026-10-25T18:00:00+01:00");
  const old = shownWarnings(copy(fetchedAt), evening);
  assert.equal(old?.notice, null);
  assert.equal(old?.warnings.length, 1);
  const failing = shownWarnings(
    copy(fetchedAt, undefined, "2026-10-25T13:00:00+01:00"),
    evening,
  );
  assert.match(failing?.notice ?? "", /13:00/);
  assert.equal(failing?.warnings.length, 1);
});

test("failing without any warning: still the notice, never nothing", () => {
  const fetchedAt = "2026-10-25T12:00:00+01:00";
  const failing = "2026-10-25T12:15:00+01:00";
  const none = copy(fetchedAt, [], failing);
  assert.deepEqual(shownWarnings(none, at(fetchedAt) + 2 * HOUR)?.warnings, []);
  assert.ok(shownWarnings(none, at(fetchedAt) + 2 * HOUR)?.notice);
  // Days later: the day too.
  assert.match(
    shownWarnings(none, at(fetchedAt) + 26 * HOUR)?.notice ?? "",
    /25 października, 12:15/,
  );
  // Not failing, no warning: nothing.
  assert.equal(
    shownWarnings(copy(fetchedAt, []), at(fetchedAt) + 26 * HOUR),
    null,
  );
  // A warning over (its own end), failing: the notice, without it.
  const end = at("2026-10-25T19:00:00+01:00");
  const over = shownWarnings(copy(fetchedAt, undefined, failing), end);
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
    notice: "Nie udało się nam sprawdzić ostrzeżeń IMGW.",
    warnings: [],
  });
});
