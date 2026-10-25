import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_IDS } from "./address-routes.ts";
import type { Disruption } from "./disruptions.ts";
import { type Alert, alertSlot, checkedLine } from "./hub.ts";
import type { PlaceView } from "./schedule.ts";
import {
  mockFile,
  POST_39885,
  storedPost,
  testPlace,
  zukFile,
} from "./water-fixture.ts";
import {
  GMINA_NEWS,
  matches,
  staleNote,
  type Water,
  water,
  waterAlerts,
  waterChecked,
  waterEmpty,
  waterNone,
  waterSources,
  waterSummary,
} from "./water-module.ts";
import {
  AI_DEFERRED,
  NOT_WATER,
  STALE_MS,
  type StoredPost,
  WATER_QUALITY,
  zukView,
} from "./zuk-data.ts";

// Sunday 25 Oct 2026, 13:30 in Warsaw (CET since 3:00 today); 39885's cuts
// are 26-29 Oct, all 8:00-16:00.
const CHECKED = "2026-10-25T12:20:00.000Z";
const NOW = new Date("2026-10-25T12:30:00Z");
const POST_URL =
  "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/";

const place = testPlace;

const ZUKI = place({});
const ASNYKA = place({ id: "0972447-00470", streetId: "0972447-00470" });
// Dąbków's own ul. Żuki (made up): the same SYM_UL, another locality.
const DABKOW_ZUKI = place({
  id: "0606004-26555",
  localityId: "0606004",
  streetId: "0606004-26555",
});
const ZALUZE = place({
  id: "0606464",
  kind: "wies",
  name: "Załuże",
  localityId: "0606464",
  streetId: null,
});
const LISIE_JAMY_CICHA = place({
  id: "0606234-02974",
  localityId: "0606234",
  streetId: "0606234-02974",
});
// Pilipy, a part of Młodów (SIMC 0606300); Młodów also has a ul. Pilipy.
const PILIPY_PART = place({
  id: "0606300",
  kind: "wies",
  localityId: "0606300",
  streetId: null,
});

const post = (over: Partial<StoredPost> = {}) =>
  storedPost(POST_39885, CHECKED, over);

function waterAt(
  address: PlaceView,
  posts = [post()],
  now = NOW,
  checkedAt = CHECKED,
): Water {
  return water(zukView(zukFile(posts, checkedAt), now), address);
}

const cut = (over: Partial<Disruption>): Disruption => ({
  ...(post().items[0] as Disruption),
  ...over,
});

test("matching: a street, only its own cut, only in its locality", () => {
  const { outages } = waterAt(ZUKI);
  assert.deepEqual(
    outages.map((d) => [d.date, d.place.streetId]),
    [["2026-10-27", "0972447-26555"]],
  );
  // No cut for the whole of Lubaczów, so another street has none.
  assert.deepEqual(waterAt(ASNYKA).outages, []);
});

test("matching: the whole locality, once a day, for every street", () => {
  // Lisie Jamy: the whole village on 26 and 29 Oct, and each of its
  // streets as well (the gate's expansion): one cut a day.
  const { outages } = waterAt(LISIE_JAMY_CICHA);
  assert.deepEqual(
    outages.map((d) => [d.date, d.place.streetId]),
    [
      ["2026-10-26", null],
      ["2026-10-29", null],
    ],
  );
});

test("matching: the same street name in another locality never mixes", () => {
  const zukiInLubaczow = cut({
    place: { localityId: "0972447", streetId: "0972447-26555" },
  });
  const zukiInDabkow = cut({
    place: { localityId: "0606004", streetId: "0606004-26555" },
  });
  assert.equal(matches(ZUKI, zukiInLubaczow), true);
  assert.equal(matches(ZUKI, zukiInDabkow), false);
  assert.equal(matches(DABKOW_ZUKI, zukiInLubaczow), false);
  assert.equal(matches(DABKOW_ZUKI, zukiInDabkow), true);
  // In 39885 Dąbków's ul. Żuki gets Dąbków's whole-village cut only.
  assert.deepEqual(
    waterAt(DABKOW_ZUKI).outages.map((d) => d.place),
    [{ localityId: "0606004", streetId: null }],
  );
});

test("matching: a village part takes its own cuts, not its village's", () => {
  const part = cut({ place: { localityId: "0606300", streetId: null } });
  const village = cut({ place: { localityId: "0606286", streetId: null } });
  const villageStreet = cut({
    place: { localityId: "0606286", streetId: "0606286-39507" },
  });
  assert.equal(matches(PILIPY_PART, part), true);
  assert.equal(matches(PILIPY_PART, village), false);
  assert.equal(matches(PILIPY_PART, villageStreet), false);
  // 39885's „Młodów ul. Pilipy” is Młodów's street, not the part.
  assert.deepEqual(waterAt(PILIPY_PART).outages, []);
});

test("alert: the nearest cut, an absolute date, the subpage, the source", () => {
  assert.deepEqual(waterAlerts(waterAt(ZUKI)), [
    {
      text: "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
      href: "/adres/0972447-26555/woda",
      short: "ZUK Mokrzyca",
      from: "2026-10-27T08:00:00+01:00",
    },
  ]);
  const [lisie] = waterAlerts(waterAt(LISIE_JAMY_CICHA));
  assert.equal(
    lisie.text,
    "przerwa w dostawie – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
  );
  // The number as given goes along, as the card's „Szczegóły”.
  const [withNr] = waterAlerts(waterAt(place({ givenNr: "5" })));
  assert.equal(withNr.href, "/adres/0972447-26555/woda?nr=5");
  assert.deepEqual(waterAlerts(waterAt(ASNYKA)), []);
});

test("alert slot: water before the weather, at most 2, the rest counted", () => {
  const order = (id: (typeof MODULE_IDS)[number]) => MODULE_IDS.indexOf(id);
  const weather = (from: string): Alert => ({
    text: "Silny wiatr, stopień 1 z 3.",
    href: "https://meteo.imgw.pl/",
    short: "IMGW-PIB",
    from,
  });
  const [waterAlert] = waterAlerts(waterAt(ZUKI));
  const { shown, more } = alertSlot([
    { order: order("pogoda"), alert: weather("2026-10-25T13:00:00+01:00") },
    { order: order("pogoda"), alert: weather("2026-10-25T10:00:00+01:00") },
    { order: order("woda"), alert: waterAlert },
  ]);
  assert.deepEqual(
    shown.map((s) => s.alert.from),
    ["2026-10-27T08:00:00+01:00", "2026-10-25T10:00:00+01:00"],
  );
  assert.equal(more, 1);
});

test("card: the cut, where, as written, and the post as its source", () => {
  assert.deepEqual(waterSummary(waterAt(ZUKI)), [
    ["Najbliższa przerwa", ["wtorek, 27 października, 8:00–16:00"]],
    ["Gdzie", ["cała ulica Żuki"]],
  ]);
  assert.deepEqual(waterSummary(waterAt(ZALUZE)), [
    ["Najbliższa przerwa", ["środa, 28 października, 8:00–16:00"]],
    ["Gdzie", ["Załuże: Podłęże od numeru 44 do numeru 92"]],
  ]);
  assert.deepEqual(waterSummary(waterAt(LISIE_JAMY_CICHA))?.slice(1), [
    ["Gdzie", ["cała miejscowość Lisie Jamy"]],
    ["Kolejne", ["czwartek, 29 października"]],
  ]);
  assert.deepEqual(waterSources(waterAt(ZUKI)), [
    [{ href: POST_URL, text: "Komunikat gminy z 23 października 2026" }],
  ]);
});

test("no cut here: no card, „Bez zapowiedzi” with the gmina's news", () => {
  const data = waterAt(ASNYKA);
  assert.equal(waterSummary(data), null);
  assert.equal(waterNone(data), "brak zapowiedzianych przerw w dostawie");
  assert.deepEqual(waterSources(data), [
    [{ href: GMINA_NEWS, text: "aktualności gminy Lubaczów" }],
  ]);
});

test("/woda empty: a warm sentence and the gmina's news; none with a cut", () => {
  assert.deepEqual(waterEmpty(waterAt(ASNYKA)), [
    "Nie wiemy o żadnej zapowiedzianej przerwie w dostawie wody pod tym adresem. Gmina ogłasza je w ",
    { href: GMINA_NEWS, text: "aktualności gminy Lubaczów" },
    ".",
  ]);
  assert.equal(waterEmpty(waterAt(ZUKI)), null);
});

test("freshness: the checked line always, the stale note only after 1 h", () => {
  const checked = Date.parse(CHECKED);
  const at = (ms: number) =>
    waterAt(ZUKI, [post()], new Date(checked + ms), CHECKED);
  const fresh = at(STALE_MS);
  assert.equal(
    checkedLine(waterChecked(fresh)),
    "Ostatnio sprawdziliśmy: 25 października, 13:20",
  );
  assert.equal(staleNote(fresh), null);
  assert.equal(waterSummary(fresh)?.length, 2);

  const stale = at(STALE_MS + 1);
  assert.equal(
    checkedLine(waterChecked(stale)),
    "Ostatnio sprawdziliśmy: 25 października, 13:20",
  );
  const note = staleNote(stale);
  assert.ok(note);
  assert.deepEqual(note[1], {
    href: GMINA_NEWS,
    text: "aktualności gminy Lubaczów",
  });
  // The cuts stay, the note joins them.
  assert.deepEqual(waterSummary(stale)?.at(-1), ["Uwaga", note]);
  assert.equal(waterAlerts(stale).length, 1);
  assert.match(waterNone(at(STALE_MS + 1)), /przy ostatnim sprawdzeniu/);
});

test("checked line: null renders nothing; Warsaw time over midnight and DST", () => {
  assert.equal(checkedLine(null), null);
  const line = (iso: string) => checkedLine(new Date(iso));
  // Summer time until 3:00 on 25 Oct: midnight is 22:00 UTC the day before.
  assert.equal(
    line("2026-10-24T21:59:00Z"),
    "Ostatnio sprawdziliśmy: 24 października, 23:59",
  );
  assert.equal(
    line("2026-10-24T22:00:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 0:00",
  );
  // 2:30 happens twice: CEST (0:30 UTC), then CET (1:30 UTC).
  assert.equal(
    line("2026-10-25T00:30:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 2:30",
  );
  assert.equal(
    line("2026-10-25T01:30:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 2:30",
  );
  // From then on, CET: midnight is 23:00 UTC.
  assert.equal(
    line("2026-10-25T22:59:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 23:59",
  );
  assert.equal(
    line("2026-10-25T23:00:00Z"),
    "Ostatnio sprawdziliśmy: 26 października, 0:00",
  );
});

test("no file: the gmina's news only, no cut, no checked line", () => {
  const data = water(zukView(null, NOW), ZUKI);
  assert.deepEqual(data.outages, []);
  assert.equal(waterSummary(data), null);
  assert.deepEqual(waterAlerts(data), []);
  assert.equal(waterChecked(data), null);
  assert.equal(staleNote(data), null);
  assert.equal(waterNone(data), "nie udało się nam sprawdzić komunikatów");
  assert.deepEqual(waterSources(data), [
    [{ href: GMINA_NEWS, text: "aktualności gminy Lubaczów" }],
  ]);
  assert.match(
    String(waterEmpty(data)?.[0]),
    /^Nie udało się nam teraz sprawdzić/,
  );
});

test("notices: a link, only where the gate found the locality", () => {
  // 39885 as a Notice (as if unreadable): its localities, from the text.
  const notice = post({ status: "notice", reason: "ambiguous", items: [] });
  assert.ok(notice.localityIds.includes("0606464"));
  const data = waterAt(ZALUZE, [notice]);
  assert.deepEqual(data.outages, []);
  assert.equal(data.notices.length, 1);
  assert.deepEqual(waterSummary(data), [
    [
      "Komunikat",
      [
        {
          href: POST_URL,
          text: "Gmina ogłosiła przerwę w dostawie wody, której nie umiemy dopasować do adresów – sprawdź komunikat",
          hidden: "„Przerwy w dostawie wody: 26-29.10.2026”",
        },
      ],
    ],
  ]);
  assert.deepEqual(waterAlerts(data), []);
  // Szczutków is not in its text.
  assert.ok(!notice.localityIds.includes("0606375"));
  const szczutkow = place({
    id: "0606375",
    kind: "wies",
    localityId: "0606375",
    streetId: null,
  });
  assert.deepEqual(waterAt(szczutkow, [notice]).notices, []);
});

test("notices: never for ai-deferred, not-water or water-quality posts", () => {
  for (const reason of [AI_DEFERRED, NOT_WATER, WATER_QUALITY]) {
    const hidden = post({ status: "notice", reason, items: [] });
    const data = waterAt(ZALUZE, [hidden]);
    assert.deepEqual(data.notices, [], reason);
    assert.deepEqual(data.outages, [], reason);
    assert.equal(waterSummary(data), null, reason);
  }
});

test("past cuts: gone at midnight in Warsaw, not in UTC", () => {
  // ul. Żuki's cut is on Tuesday 27 Oct; Warsaw is UTC+1.
  const at = (iso: string) => waterAt(ZUKI, [post()], new Date(iso), iso);
  assert.equal(waterAlerts(at("2026-10-27T22:59:59Z")).length, 1);
  assert.ok(waterSummary(at("2026-10-27T22:59:59Z")));
  const after = at("2026-10-27T23:00:00Z");
  assert.deepEqual(after.outages, []);
  assert.deepEqual(waterAlerts(after), []);
  assert.equal(waterSummary(after), null);
});

test("dev mock: fresh, stale or no file; anything else is no mock", () => {
  const now = NOW.getTime();
  const fresh = mockFile("39885", now);
  const stale = mockFile("39885-stale", now);
  assert.ok(fresh && stale);
  assert.equal(zukView(fresh, NOW).stale, false);
  assert.equal(zukView(stale, NOW).stale, true);
  assert.equal(mockFile("none", now), null);
  assert.equal(mockFile("39886", now), undefined);
});
