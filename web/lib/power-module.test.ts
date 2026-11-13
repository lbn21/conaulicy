import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHECK_LAG_MS } from "./live-status.ts";
import { MODULES } from "./modules.ts";
import { ours, type PgeFeed, parseOutages } from "./pge-feed.ts";
import { derivedOurs, FAILURE_ID, NO_RANGES_ID } from "./pge-fixture.ts";
import {
  PGE_PAGE,
  type Power,
  power,
  powerNotices,
  powerPage,
  powerUpcoming,
} from "./power-module.ts";
import { testPlace } from "./water-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

// 11 Nov 2026, 17:52 in Warsaw: the derived Lubaczów failure (16:03 to
// 18:15) is on; the real planned outages (17-20 Nov) are to come.
const NOW = Date.parse("2026-11-11T16:52:00Z");
const MIN = 60_000;

const FEED: PgeFeed = {
  fetchedAt: new Date(NOW).toISOString(),
  items: ours(
    parseOutages(derivedOurs(), () => {}),
    ZUK_PLACES,
    () => {},
  ),
};

const village = (id: string, name: string, kind = "wies") =>
  testPlace({
    id,
    kind: kind as "wies",
    name,
    label: name,
    area: name,
    group: id,
    gmina: "Lubaczów (gmina)",
    localityId: id,
    streetId: null,
  });
const BASZNIA = village("0605950", "Basznia Górna");
const MALCE = village("0605973", "Malce", "czesc_wsi");
const HUTA = village("0606100", "Huta Kryształowa");
const TOWN = village("0972447", "Lubaczów", "miasto");
const ASNYKA = testPlace({
  id: "0972447-00470",
  name: "ul. Adama Asnyka",
  label: "ul. Adama Asnyka, Lubaczów",
  streetId: "0972447-00470",
});
const ZUKI = testPlace();

const at = (place = BASZNIA, { checkedAgo = 0, now = NOW, feed = FEED } = {}) =>
  power(
    {
      feed,
      checkedAt: now - checkedAgo * MIN,
      changedAt: now - checkedAgo * MIN,
    },
    place,
    now,
  ) as Power;

const uuids = (data: Power) => data.cuts.map((cut) => cut.uuid.slice(0, 8));

test("the rule: a locality's own outages, its parts' village's street-less ones, never others'", () => {
  // Basznia Górna: its own three (whole-village, two-range, envelope).
  assert.deepEqual(uuids(at(BASZNIA)), ["4497d8b9", "6fbd5cfd"]);
  // Malce, a part of Basznia Górna: its own address in 4497d8b9 and
  // the village's street-less 6fbd5cfd.
  assert.deepEqual(uuids(at(MALCE)), ["4497d8b9", "6fbd5cfd"]);
  assert.deepEqual(
    at(MALCE).cuts[0].where.map((w) => w.name),
    ["Basznia Górna", "Malce"],
  );
  // Huta Kryształowa: its three; the revoked one kept for the subpage.
  assert.deepEqual(uuids(at(HUTA)), ["f76971d9", "77d6b8f2", "4497d8b9"]);
  // A street: only its street's; the town's page: every street's, named.
  assert.deepEqual(uuids(at(ASNYKA)), [FAILURE_ID.slice(0, 8)]);
  assert.deepEqual(at(ASNYKA).cuts[0].where, [
    { name: "ul. Adama Asnyka", numbers: "23, 52, 58A" },
  ]);
  assert.deepEqual(
    at(TOWN).cuts[0].where.map((w) => w.name),
    ["ul. Adama Asnyka", "ul. Jasna"],
  );
  // Another street of the town: none.
  assert.deepEqual(uuids(at(ZUKI)), []);
});

test("the timeline: a row per range, revoked never; a failure's end an estimate", () => {
  const huta = powerUpcoming(at(HUTA));
  // f76971d9's two ranges, 4497d8b9's two; 77d6b8f2 revoked: none.
  assert.deepEqual(
    huta.map((item) => [item.span.day, item.span.from, item.span.to]),
    [
      ["2026-11-17", "8:30", "9:30"],
      ["2026-11-17", "14:30", "15:30"],
      ["2026-11-20", "8:00", "9:00"],
      ["2026-11-20", "19:00", "20:00"],
    ],
  );
  assert.ok(
    huta.every(
      (item) =>
        item.module === "prad" && "emergency" in item && !item.emergency,
    ),
  );
  assert.equal(
    huta[0].second,
    "Huta Kryształowa, tylko pod niektórymi numerami – sprawdź w szczegółach.",
  );
  // No numbers at all: the place alone.
  const whole = powerUpcoming(at(BASZNIA)).find(
    (item) => item.span.from === "9:00",
  );
  assert.equal(whole?.second, "Basznia Górna.");
  // The failure: on now, „ok.” its end.
  const [failure] = powerUpcoming(at(ASNYKA));
  assert.equal("emergency" in failure && failure.emergency, true);
  assert.equal(failure.span.about, true);
  assert.equal(failure.span.to, "18:15");
});

test("a failure past PGE's estimate, still listed: on until CHECK_LAG_MS after the last check", () => {
  const late = NOW + 60 * MIN;
  const [failure] = powerUpcoming(at(ASNYKA, { now: late }));
  // 17:52 + 60 min, checked then: on until 55 min later.
  assert.equal(CHECK_LAG_MS, 55 * MIN);
  assert.equal(failure.span.to, "19:47");
  assert.equal(failure.span.about, true);
  // A planned range over: gone; the day's later one stays.
  const after = Date.parse("2026-11-17T09:00:00Z");
  assert.deepEqual(
    powerUpcoming(at(HUTA, { now: after })).map((i) => i.span.from),
    ["14:30", "8:00", "19:00"],
  );
});

test("a failure still listed, past its end: in the view at every stored check age a healthy cron leaves, gone after", () => {
  // Its stated end, 18:15, an hour behind; the status file written every
  // third run (lib/live-status.ts checksWorth).
  const late = NOW + 60 * MIN;
  const failure = (checkedAgo: number) =>
    uuids(at(ASNYKA, { now: late, checkedAgo })).includes(
      FAILURE_ID.slice(0, 8),
    );
  for (const ago of [0, 15, 30, 45]) assert.ok(failure(ago), `${ago} min`);
  assert.ok(failure(CHECK_LAG_MS / MIN - 1));
  assert.ok(!failure(CHECK_LAG_MS / MIN));
});

test("no dateRanges: the whole startAt-stopAt, one row", () => {
  const cut = at(BASZNIA).cuts.find((c) => c.uuid === NO_RANGES_ID);
  assert.deepEqual(cut?.ranges, [
    { start: "2026-11-20T09:00:00+01:00", end: "2026-11-20T20:00:00+01:00" },
  ]);
});

test("the copy's age: stale, the notice with PGE's page; too old, the notice alone; unreadable", () => {
  assert.deepEqual(powerNotices(at(HUTA)), []);
  const stale = at(HUTA, { checkedAgo: 70 });
  assert.equal(stale.cuts.length, 3);
  assert.deepEqual(powerNotices(stale), [
    [
      [
        "Nie udało się teraz pobrać danych PGE. Pokazujemy ostatnie dane z 16:42. Aktualne znajdziesz na ",
        { href: PGE_PAGE, text: "stronie PGE Dystrybucja" },
        ".",
      ],
    ],
  ]);
  const old = at(HUTA, { checkedAgo: 180 });
  assert.deepEqual(old.cuts, []);
  assert.equal(
    old.notice,
    "Od 14:52 nie udało się nam pobrać danych PGE, więc ich nie pokazujemy.",
  );
  assert.equal(powerPage(old).empty, null);
  const unreadable = power("unreadable", HUTA, NOW);
  assert.equal(
    unreadable?.notice,
    "Nie udało się teraz sprawdzić przerw w dostawie prądu.",
  );
  assert.equal(power(null, HUTA, NOW), null);
  // Nothing here, fresh: the plain empty line.
  assert.deepEqual(powerPage(at(ZUKI)).empty, [
    "PGE nie zapowiada przerw w dostawie prądu pod tym adresem.",
  ]);
});

/** The /prad subpage's body, as Details renders it. */
const subpage = (data: Power) =>
  renderToStaticMarkup(createElement(MODULES.prad.Details, { data })).replace(
    /<svg\b.*?<\/svg>/g,
    "<svg/>",
  );

test("/prad: a day each, a chip per window, the kind's badge, our names, PGE's numbers verbatim", () => {
  const html = subpage(at(HUTA));
  assert.match(
    html,
    /<dd class="govuk-summary-list__value"><ul class="app-chips"><li class="app-chip"><svg\/>[^<]*8:30[^<]*9:30[^<]*<\/li><li class="app-chip"><svg\/>[^<]*14:30[^<]*15:30[^<]*<\/li><\/ul><\/dd>/,
  );
  // The kind a badge alone: planned in the module's tone.
  assert.match(
    html,
    /<dd class="govuk-summary-list__value"><strong class="app-badge app-badge--mod">[^<]+<\/strong><\/dd>/,
  );
  // PGE's numbers verbatim.
  assert.match(
    html,
    /<dd class="govuk-summary-list__value">\., 0, 1, 2, 3, 3\/1, 4, 4\/1, 5, 6, DZ 17\/18, DZ 17\/20<\/dd>/,
  );
  // The revoked one: a muted badge, then the kind and PGE's note.
  assert.match(
    html,
    /<dd class="govuk-summary-list__value"><strong class="app-badge">[^<]+<\/strong> [^<]+Prace zostały przełożone\.<\/dd>/,
  );
  // Only this place's addresses; on a part, its village's too, each
  // named with its numbers.
  assert.doesNotMatch(html, /Basznia|Podlesie/);
  assert.match(
    subpage(at(MALCE)),
    /Basznia Górna: 100, 100119, [^;]+; Malce: 1</,
  );
  // The source: PGE's public page, and the check's time.
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body-s app-quiet govuk-!-margin-bottom-2">[^<]*<a href="https:\/\/pgedystrybucja\.pl\/wylaczenia\/aktualne-przerwy-w-dostawie-energii" class="govuk-link">[^<]+<\/a>[^<]*<\/p><p class="govuk-body-s app-quiet govuk-!-margin-bottom-2">[^<]*11\.11,\u00a017:52[^<]*<\/p>/,
  );
  // No calendar and no AI note: PGE's data is read, not guessed.
  assert.doesNotMatch(html, /role="button"|govuk-warning-text/);
  const failure = subpage(at(ASNYKA));
  assert.match(failure, /16:03[^<]*18:15/);
  assert.match(
    failure,
    /<dd class="govuk-summary-list__value"><strong class="app-badge app-badge--alert"><svg\/>[^<]+<\/strong><\/dd>/,
  );
  assert.match(failure, />23, 52, 58A</);
  // PGE gives no numbers: the street still named, with a line of its own.
  assert.match(subpage(at(TOWN)), /ul\. Jasna: [^<;]+/);
});
