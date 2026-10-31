import assert from "node:assert/strict";
import { test } from "node:test";
import { banner, imgwCopyOf, POWIAT } from "./imgw-banner.ts";
import { derived1809, REAL_2026_10_24 } from "./imgw-fixture.ts";
import {
  type Feed,
  feedFile,
  IMGW_ATTRIBUTION,
  POWIATS,
  parseFeed,
} from "./imgw-warnings.ts";
import { IMGW_KEY, MAX_AGE_MS, nextChecks, STALE_MS } from "./live-status.ts";

const HOUR = 3_600_000;
const quiet = () => {};
const at = (iso: string) => Date.parse(iso);

// The derived 1809 warning (not real): level 1, 75%, 25 Oct 13:00-19:00.
const WIND =
  "Prawdopodobieństwo: 75%. Prognozuje się wystąpienie dość silnego wiatru o średniej prędkości do 35 km/h, w porywach do 75 km/h, z południa.";
const SOURCE = IMGW_ATTRIBUTION.join(" ");

// The last good check at `checkedAt`; the feed file written then too.
const copy = (checkedAt: string, items = parseFeed(derived1809(), quiet)) => ({
  feed: { fetchedAt: checkedAt, items } satisfies Feed,
  checkedAt: at(checkedAt),
});

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

test("the banner covers our one powiat", () => {
  assert.deepEqual([...POWIATS], [POWIAT]);
});

test("one warning in force: title, tag, until when, source, details, footer", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  assert.deepEqual(banner(copy("2026-10-25T13:52:10+01:00"), now), {
    title: "Ostrzeżenie IMGW",
    notice: null,
    more: "Szczegóły ostrzeżenia",
    warnings: [
      {
        id: "Sk20261024094213061",
        from: "2026-10-25T13:00:00+01:00",
        to: "2026-10-25T19:00:00+01:00",
        event: "Silny wiatr",
        tag: "govuk-tag govuk-tag--yellow",
        level: "Stopień 1 z 3",
        short: "do niedzieli 25 października, 19:00",
        when: "Obowiązuje teraz, do niedzieli 25 października, 19:00.",
        details: WIND,
      },
    ],
    source: "Źródło: IMGW-PIB",
    footer: "Dotyczy całego powiatu lubaczowskiego. Stan na 13:52.",
    attribution: SOURCE,
  });
});

test("to come: from when to when, the end's day only if another day", () => {
  const evening = at("2026-10-24T20:00:00+02:00");
  const [same] =
    banner(copy("2026-10-24T19:55:00+02:00"), evening)?.warnings ?? [];
  assert.equal(same.when, "Od niedzieli 25 października, 13:00 do 19:00.");
  assert.equal(same.short, "od niedzieli 25 października, 13:00");
  const night = extra("n", "3", "2026-10-25 22:00:00", "2026-10-26 07:00:00");
  const [cross] =
    banner(copy("2026-10-24T19:55:00+02:00", night), evening)?.warnings ?? [];
  assert.equal(
    cross.when,
    "Od niedzieli 25 października, 22:00 do poniedziałku 26 października, 7:00.",
  );
  assert.equal(cross.tag, "govuk-tag govuk-tag--red");
  assert.equal(cross.level, "Stopień 3 z 3");
});

test("several warnings: one banner, plural title, highest level first", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  const items = [
    ...extra("two", "2", "2026-10-25 10:00:00", "2026-10-25 21:00:00"),
    ...extra("three", "3", "2026-10-25 16:00:00", "2026-10-25 20:00:00"),
  ];
  const shown = banner(copy("2026-10-25T13:50:00+01:00", items), now);
  assert.equal(shown?.title, "Ostrzeżenia IMGW");
  assert.equal(shown?.more, "Szczegóły ostrzeżeń");
  assert.deepEqual(
    shown?.warnings.map((w) => [w.id, w.tag, w.level, w.short, w.when]),
    [
      [
        "three",
        "govuk-tag govuk-tag--red",
        "Stopień 3 z 3",
        "od niedzieli 25 października, 16:00",
        "Od niedzieli 25 października, 16:00 do 20:00.",
      ],
      [
        "two",
        "govuk-tag govuk-tag--orange",
        "Stopień 2 z 3",
        "do niedzieli 25 października, 21:00",
        "Obowiązuje teraz, do niedzieli 25 października, 21:00.",
      ],
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
  const fresh = banner(copy(checkedAt), now + STALE_MS);
  assert.equal(fresh?.notice, null);
  assert.equal(fresh?.warnings.length, 1);
  const stale = banner(copy(checkedAt), now + STALE_MS + 1);
  assert.equal(
    stale?.notice,
    "Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z 12:00.",
  );
  assert.equal(stale?.warnings.length, 1);
  assert.equal(
    stale?.footer,
    "Dotyczy całego powiatu lubaczowskiego. Stan na 12:00.",
  );
  assert.equal(
    banner(copy(checkedAt), now + MAX_AGE_MS - 1)?.warnings.length,
    1,
  );
  const old = banner(copy(checkedAt), now + MAX_AGE_MS);
  assert.deepEqual(
    [old?.title, old?.notice, old?.warnings],
    [
      "Ostrzeżenia IMGW",
      "Od 12:00 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.",
      [],
    ],
  );
});

test("stale or too old without any warning: still the notice, never nothing", () => {
  const checkedAt = "2026-10-25T12:00:00+01:00";
  const none = copy(checkedAt, []);
  assert.equal(banner(none, at(checkedAt) + STALE_MS), null);
  const stale = banner(none, at(checkedAt) + STALE_MS + 1);
  assert.deepEqual(
    [stale?.title, stale?.notice, stale?.warnings],
    [
      "Ostrzeżenia IMGW",
      "Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z 12:00.",
      [],
    ],
  );
  // Days later: the day too.
  const later = banner(none, at(checkedAt) + 26 * HOUR);
  assert.equal(
    later?.notice,
    "Od niedzieli 25 października, 12:00 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy.",
  );
  // A warning over, the copy stale: the notice, without it.
  const end = at("2026-10-25T19:00:00+01:00");
  const over = banner(copy("2026-10-25T17:30:00+01:00"), end);
  assert.deepEqual([over?.warnings.length, !!over?.notice], [0, true]);
});

test("nothing to show: no copy, or a fresh one with no warning for 1809, or every one over", () => {
  const fetchedAt = "2026-10-25T18:55:00+01:00";
  assert.equal(banner(null, at(fetchedAt)), null);
  const real = parseFeed(JSON.parse(REAL_2026_10_24), quiet);
  assert.equal(banner(copy(fetchedAt, real), at(fetchedAt)), null);
  assert.equal(banner(copy(fetchedAt, []), at(fetchedAt)), null);
  const end = at("2026-10-25T19:00:00+01:00");
  assert.equal(banner(copy(fetchedAt), end - 1)?.warnings.length, 1);
  assert.equal(banner(copy(fetchedAt), end), null);
});
