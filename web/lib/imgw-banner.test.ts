import assert from "node:assert/strict";
import { test } from "node:test";
import { banner, POWIAT } from "./imgw-banner.ts";
import { derived1809, REAL_2026_10_24 } from "./imgw-fixture.ts";
import {
  type Feed,
  IMGW_ATTRIBUTION,
  POWIATS,
  parseFeed,
} from "./imgw-warnings.ts";

const HOUR = 3_600_000;
const quiet = () => {};
const at = (iso: string) => Date.parse(iso);

// The derived 1809 warning (not real): level 1, 75%, 25 Oct 13:00-19:00.
const WIND =
  "Prawdopodobieństwo: 75%. Prognozuje się wystąpienie dość silnego wiatru o średniej prędkości do 35 km/h, w porywach do 75 km/h, z południa.";
const SOURCE = IMGW_ATTRIBUTION.join(" ");

const copy = (fetchedAt: string, items = parseFeed(derived1809(), quiet)) => ({
  feed: { fetchedAt, items } satisfies Feed,
  stale: false,
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

test("one warning in force: title, tag, until when, details, footer", () => {
  const now = at("2026-10-25T14:00:00+01:00");
  assert.deepEqual(banner(copy("2026-10-25T13:52:10+01:00"), now), {
    title: "Ostrzeżenie IMGW",
    more: "Szczegóły ostrzeżenia",
    warnings: [
      {
        id: "Sk20261024094213061",
        event: "Silny wiatr",
        tag: "govuk-tag govuk-tag--yellow",
        level: "Stopień 1 z 3",
        short: "do niedzieli 25 października, 19:00",
        when: "Obowiązuje teraz, do niedzieli 25 października, 19:00.",
        details: WIND,
      },
    ],
    footer: `Dotyczy całego powiatu lubaczowskiego. Stan na 13:52. ${SOURCE}`,
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

test("stale: shown with a note under 3 hours, not at all from 3 hours", () => {
  const fetchedAt = "2026-10-25T12:00:00+01:00";
  const stale = { ...copy(fetchedAt), stale: true };
  const now = at(fetchedAt) + 3 * HOUR - 1;
  assert.equal(
    banner(stale, now)?.footer,
    `Dotyczy całego powiatu lubaczowskiego. Stan na 12:00. Nowszych danych nie udało się pobrać. ${SOURCE}`,
  );
  assert.equal(banner(stale, now + 1), null);
  assert.equal(banner(copy(fetchedAt), now + 1), null);
});

test("nothing to show: no copy, no warning for 1809, or every one over", () => {
  const fetchedAt = "2026-10-25T18:55:00+01:00";
  assert.equal(banner(null, at(fetchedAt)), null);
  const real = parseFeed(JSON.parse(REAL_2026_10_24), quiet);
  assert.equal(banner(copy(fetchedAt, real), at(fetchedAt)), null);
  assert.equal(banner(copy(fetchedAt, []), at(fetchedAt)), null);
  const end = at("2026-10-25T19:00:00+01:00");
  assert.equal(banner(copy(fetchedAt), end - 1)?.warnings.length, 1);
  assert.equal(banner(copy(fetchedAt), end), null);
});
