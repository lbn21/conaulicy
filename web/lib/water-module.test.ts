import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_IDS } from "./address-routes.ts";
import type { Disruption } from "./disruptions.ts";
import { DISTRICTS } from "./districts-seed.ts";
import { type Alert, alertSlot, checkedLine } from "./hub.ts";
import { MODULES } from "./modules.ts";
import {
  CUT_99,
  CUT_100,
  MZGKIM_READINGS,
  realMzgkimPost,
} from "./mzgkim-fixture.ts";
import { PART_STREETS } from "./part-streets.ts";
import type { PlaceView } from "./schedule.ts";
import {
  bothViews,
  KROWICA_RANGE,
  lisiePartly,
  mockFile,
  mzgkimPost,
  POST_39885,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
  zukFile,
} from "./water-fixture.ts";
import {
  type Cut,
  cutWhere,
  GMINA_NEWS,
  MZGKIM_NEWS,
  matches,
  noticeLink,
  outsideRange,
  scope,
  staleNote,
  WATER_AI_NOTE,
  type Water,
  water,
  waterAiNote,
  waterAlerts,
  waterCalendarHint,
  waterChecked,
  waterEmpty,
  waterNone,
  waterSources,
  waterSummary,
  waterTrace,
} from "./water-module.ts";
import { MZGKIM as MZGKIM_SOURCE, sourcesAt } from "./water-sources.ts";
import { type PostReading, readPost } from "./zuk.ts";
import {
  AI_DEFERRED,
  NOT_WATER,
  STALE_MS,
  type StoredPost,
  WATER_QUALITY,
  zukView,
} from "./zuk-data.ts";
import {
  PLACES,
  POST_39885_EDITED,
  reading39885Edited,
} from "./zuk-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const waterLine = (at: Parameters<typeof checkedLine>[0]) =>
  checkedLine(at, "woda");

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

// Smolińce, a part of Lisie Jamy: a village, outside MZGKiM's area.
const SMOLINCE = place({
  id: "0606257",
  kind: "wies",
  name: "Smolińce",
  localityId: "0606257",
  streetId: null,
});
// Mazury, a part of the town.
const MAZURY = place({
  id: "0972453",
  kind: "wies",
  name: "Mazury",
  localityId: "0972453",
  streetId: null,
});

const GMINA = { href: GMINA_NEWS, text: "aktualności gminy Lubaczów" };
const MZGKIM = { href: MZGKIM_NEWS, text: "komunikaty MZGKiM" };
const MZGKIM_OF = { href: MZGKIM_NEWS, text: "komunikatów MZGKiM" };

const post = (over: Partial<StoredPost> = {}) =>
  storedPost(POST_39885, CHECKED, over);

function waterAt(
  address: PlaceView,
  posts = [post()],
  now = NOW,
  checkedAt = CHECKED,
): Water {
  return water(bothViews(posts, checkedAt, now), address);
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

test("matching: a village part takes its own cuts and its whole village's", () => {
  const part = cut({ place: { localityId: "0606300", streetId: null } });
  const village = cut({ place: { localityId: "0606286", streetId: null } });
  const villageStreet = cut({
    place: { localityId: "0606286", streetId: "0606286-39507" },
  });
  assert.equal(village.scope.type, "whole");
  assert.equal(village.note, null);
  assert.equal(matches(PILIPY_PART, part), true);
  assert.equal(matches(PILIPY_PART, village), true);
  // task 188: every Pilipy address is „Młodów, ul. Pilipy N” (PRG), so the
  // part gets ul. Pilipy's cuts (lib/part-streets.ts), whole: certain.
  assert.equal(matches(PILIPY_PART, villageStreet), true);
  const { outages } = waterAt(PILIPY_PART);
  assert.deepEqual(
    outages.map((d) => d.uid),
    ["zuk-39885-2026-10-28-0606286-39507"],
  );
  assert.equal(scope(outages[0] as Disruption), "cała ulica Pilipy");
  // The part's own words: the street with its village.
  assert.equal(
    cutWhere(outages[0] as Cut, PILIPY_PART),
    "ulica Pilipy w Młodowie",
  );
  assert.deepEqual(waterSummary(waterAt(PILIPY_PART))?.[1], [
    "Gdzie",
    ["ulica Pilipy w Młodowie"],
  ]);
  // In part: „w części ulicy Pilipy”, the street's words with its village.
  const pilipyPart = cut({
    ...villageStreet,
    label: { locality: "Młodów", parent: null, street: "Pilipy" },
    scope: { type: "unknown" },
    note: "od nr 1 do nr 9",
  });
  const inPart = waterAt(PILIPY_PART, only(pilipyPart));
  assert.equal(
    waterAlerts(inPart)[0]?.text,
    "przerwa w dostawie w części ulicy Pilipy – poniedziałek, 26 października, 8:00–16:00.",
  );
  assert.equal(
    cutWhere(inPart.outages[0] as Cut, PILIPY_PART),
    "ulica Pilipy w Młodowie: od nr 1 do nr 9",
  );
  assert.equal(
    waterAlerts(waterAt(PILIPY_PART))[0]?.text,
    "przerwa w dostawie – środa, 28 października, 8:00–16:00.",
  );
  // Never hidden for a number: not the part's own cut.
  assert.equal(waterAt({ ...PILIPY_PART, givenNr: "999" }).outages.length, 1);
});

// task 188: was „never takes its village's partial cuts”; a part now gets
// every cut of its village that names no street, „w części miejscowości”.
test("matching: a village part takes its village's partial cuts, never its other streets", () => {
  const village = { localityId: "0606286", streetId: null };
  const młodów = { locality: "Młodów", parent: null, street: null };
  for (const [name, over, expected] of [
    ["w części", { scope: { type: "unknown" } }, true],
    [
      "ranges",
      { scope: { type: "ranges", ranges: [{ from: "1", to: "9" }] } },
      true,
    ],
    ["numbers", { scope: { type: "numbers", numbers: ["5"] } }, true],
    ["note", { note: "gospodarstwa zasilane z SUW Mokrzyca" }, true],
    // ul. Warszawska, not linked to Pilipy.
    ["street", { place: { ...village, streetId: "0606286-23682" } }, false],
  ] as Array<[string, Partial<Disruption>, boolean]>) {
    const partial = cut({ place: village, label: młodów, ...over });
    assert.equal(matches(PILIPY_PART, partial), expected, name);
    if (!expected) continue;
    const data = waterAt({ ...PILIPY_PART, givenNr: "3" }, only(partial));
    assert.equal(data.outages.length, 1, name);
    assert.equal(
      waterAlerts(data)[0]?.text,
      "przerwa w dostawie w części miejscowości Młodów – poniedziałek, 26 października, 8:00–16:00.",
      name,
    );
  }
});

test("matching: 39885's whole villages reach their parts, one cut a day", () => {
  const BASZNIA = place({
    id: "0605909",
    kind: "wies",
    name: "Basznia",
    localityId: "0605909",
    streetId: null,
  });
  const at = (address: PlaceView) =>
    waterAt(address).outages.map((d) => [d.date, d.start, d.end, d.place]);
  const day = (date: string, localityId: string) => [
    date,
    `${date} 08:00:00`,
    `${date} 16:00:00`,
    { localityId, streetId: null },
  ];
  assert.deepEqual(at(SMOLINCE), [
    day("2026-10-26", "0606234"),
    day("2026-10-29", "0606234"),
  ]);
  assert.deepEqual(at(BASZNIA), [day("2026-10-28", "0605890")]);
  assert.equal(
    scope(waterAt(SMOLINCE).outages[0] as Disruption),
    "cała miejscowość Lisie Jamy",
  );
  // The part's own cut on the same day and hours: still one.
  const own = cut({
    ...(waterAt(SMOLINCE).outages[0] as Disruption),
    uid: "own",
    place: { localityId: "0606257", streetId: null },
  });
  const both = [post({ items: [...post().items, own] })];
  assert.equal(
    waterAt(SMOLINCE, both).outages.filter((d) => d.date === "2026-10-26")
      .length,
    1,
  );
});

test("matching: house numbers in a village with streets, the village and every street, any nr", () => {
  const krowica = cut(KROWICA_RANGE);
  assert.equal(
    matches({ localityId: "0606180", streetId: null }, krowica),
    true,
  );
  assert.equal(
    matches({ localityId: "0606180", streetId: "0606180-51473" }, krowica),
    true,
  );
  assert.equal(matches(ZALUZE, krowica), false);
  assert.equal(scope(krowica), "Krowica Sama: od nr 10 do nr 50");
  // A village's range in a village with streets is never filtered by nr.
  const village = place({
    id: "0606180",
    kind: "wies",
    name: "Krowica Sama",
    localityId: "0606180",
    streetId: null,
    givenNr: "99",
  });
  assert.deepEqual(waterAt(village, [post({ items: [krowica] })]).outages, [
    krowica,
  ]);
});

const SOBIESKIEGO = cut(SOBIESKIEGO_RANGE);
const ranged = (ranges: Array<{ from: string; to: string }>) =>
  cut({ ...SOBIESKIEGO_RANGE, scope: { type: "ranges", ranges } });
const only = (item: Disruption) => [post({ items: [item] })];

test("house number: outside a street's range, the cut is not shown", () => {
  const at = (nr: string | null) => waterAt(sobieskiego(nr), only(SOBIESKIEGO));
  const five = at("5");
  assert.deepEqual(five.outages, []);
  assert.deepEqual(waterAlerts(five), []);
  // task 188: was no card; now the card says the cut leaves nr 5 out.
  assert.deepEqual(waterSummary(five), [
    ["Pod nr 5", ["Brak zapowiedzianych przerw."]],
    [
      "Inne numery",
      [
        "Gmina zapowiedziała przerwę na tej ulicy – poniedziałek, 26 października, 8:00–16:00 – ale według komunikatu nie obejmuje nr 5.",
      ],
    ],
  ]);
  assert.equal(at("30").outages.length, 1);
  // Letters ignored: 30a and 47a are inside 23–47, 22a is not.
  for (const nr of ["30", "30a", "47", "47a", null])
    assert.deepEqual(at(nr).outages, [SOBIESKIEGO], String(nr));
  assert.deepEqual(at("22a").outages, []);
});

test("house number: outsideRange compares whole numbers, shown on doubt", () => {
  assert.equal(outsideRange(SOBIESKIEGO, null), false);
  assert.equal(outsideRange(SOBIESKIEGO, "5"), true);
  for (const nr of ["30", "30a", "47"])
    assert.equal(outsideRange(SOBIESKIEGO, nr), false, nr);
  // Either part of "7/22" inside is enough.
  const twenties = ranged([{ from: "20", to: "30" }]);
  assert.equal(outsideRange(twenties, "7/22"), false);
  assert.equal(outsideRange(twenties, "7/2"), true);
  assert.equal(outsideRange(ranged([{ from: "x", to: "30" }]), "5"), false);
  assert.equal(outsideRange(SOBIESKIEGO, "abc"), false);
});

test("house number: two ranges, listed numbers, unknown and whole", () => {
  const two = ranged([
    { from: "1", to: "15" },
    { from: "16", to: "54" },
  ]);
  assert.equal(outsideRange(two, "16"), false);
  assert.equal(outsideRange(two, "55"), true);
  const twelve = cut({
    ...SOBIESKIEGO_RANGE,
    scope: { type: "numbers", numbers: ["12"] },
    note: "nr 12",
  });
  assert.equal(outsideRange(twelve, "12"), false);
  assert.equal(outsideRange(twelve, "12a"), false);
  assert.equal(outsideRange(twelve, "13"), true);
  const odd = cut({
    ...SOBIESKIEGO_RANGE,
    scope: { type: "unknown" },
    note: "numery nieparzyste od 13 do 21",
  });
  const whole = cut({
    ...SOBIESKIEGO_RANGE,
    scope: { type: "whole" },
    note: null,
  });
  for (const nr of ["2", "15", "999"]) {
    assert.deepEqual(waterAt(sobieskiego(nr), only(odd)).outages, [odd], nr);
    assert.deepEqual(waterAt(sobieskiego(nr), only(whole)).outages, [whole]);
  }
});

test("house number: a village's range in a village with streets, always shown", () => {
  const krowica = cut(KROWICA_RANGE);
  const street = place({
    id: "0606180-51473",
    localityId: "0606180",
    streetId: "0606180-51473",
    givenNr: "99",
  });
  assert.deepEqual(waterAt(street, only(krowica)).outages, [krowica]);
  assert.equal(outsideRange(krowica, "99"), false);
});

test("house number: a streetless village and a village part, filtered", () => {
  const opaka = (givenNr: string | null) =>
    place({
      id: "0606317",
      kind: "wies",
      name: "Opaka",
      localityId: "0606317",
      streetId: null,
      givenNr,
    });
  // 39885: Opaka „od numeru 104 do 110” on 27 Oct.
  const opakaCuts = (nr: string | null) =>
    waterAt(opaka(nr)).outages.filter((d) => d.place.localityId === "0606317");
  assert.deepEqual(opakaCuts("5"), []);
  assert.equal(opakaCuts("105").length, 1);
  assert.equal(opakaCuts(null).length, 1);
  // 39885's Podłęże, 44–92, made the cut of a TERYT part: Czarne (Załuże).
  const part = cut({
    place: { localityId: "0606470", streetId: null },
    label: { locality: "Czarne", parent: "Załuże", street: null },
    where: "Załuże – Podłęże od numeru 44 do numeru 92",
    scope: { type: "ranges", ranges: [{ from: "44", to: "92" }] },
    note: "od numeru 44 do numeru 92",
  });
  const czarne = place({
    id: "0606470",
    kind: "wies",
    localityId: "0606470",
    streetId: null,
    givenNr: "10",
  });
  assert.deepEqual(waterAt(czarne, only(part)).outages, []);
  assert.equal(waterAt(czarne, only(part)).hiddenForNr, true);
});

test("house number: one trace line when a cut was left out", () => {
  const sob = (nr: string | null) =>
    waterAt(sobieskiego(nr), only(SOBIESKIEGO));
  assert.equal(sob("5").hiddenForNr, true);
  assert.equal(
    waterTrace(sob("5")),
    "Gmina zapowiedziała też przerwę na tej ulicy, ale według komunikatu nie obejmuje nr 5.",
  );
  for (const nr of ["30", null]) {
    assert.equal(sob(nr).hiddenForNr, false);
    assert.equal(waterTrace(sob(nr)), null);
  }
  const opaka = place({
    id: "0606317",
    kind: "wies",
    localityId: "0606317",
    streetId: null,
    givenNr: "5",
  });
  assert.equal(
    waterTrace(waterAt(opaka)),
    "Gmina zapowiedziała też przerwę w tej miejscowości, ale według komunikatu nie obejmuje nr 5.",
  );
  const odd = cut({ ...SOBIESKIEGO_RANGE, scope: { type: "unknown" } });
  assert.equal(waterTrace(waterAt(sobieskiego("999"), only(odd))), null);
});

test("house number: 39885's Załuże, Podłęże 44–92, by its houses", () => {
  const zaluze = (givenNr: string | null) => waterAt({ ...ZALUZE, givenNr });
  const text = (nr: string | null) => waterAlerts(zaluze(nr))[0]?.text;
  // 50 is inside: the cut, certain.
  assert.deepEqual(
    zaluze("50").outages.map((d) => d.uid),
    ["zuk-39885-2026-10-28-0606464"],
  );
  // task 188: the number it covers is named.
  assert.equal(
    text("50"),
    "przerwa w dostawie pod nr 50 – środa, 28 października, 8:00–16:00.",
  );
  // 10 is outside: left out, with the trace line.
  assert.deepEqual(zaluze("10").outages, []);
  assert.equal(
    waterTrace(zaluze("10")),
    "Gmina zapowiedziała też przerwę w tej miejscowości, ale według komunikatu nie obejmuje nr 10.",
  );
  // No number: part of the village.
  assert.equal(
    text(null),
    "przerwa w dostawie w części miejscowości – środa, 28 października, 8:00–16:00.",
  );
});

test("alert: the nearest cut, an absolute date, the subpage, the source", () => {
  assert.deepEqual(waterAlerts(waterAt(ZUKI)), [
    {
      text: "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
      href: "/adres/0972447-26555/woda",
      link: "Więcej o tej przerwie",
      short: "ZUK Mokrzyca",
      sourceHref: POST_URL,
      from: "2026-10-27T08:00:00+01:00",
    },
  ]);
  const [lisie] = waterAlerts(waterAt(LISIE_JAMY_CICHA));
  assert.equal(
    lisie.text,
    "przerwa w dostawie – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
  );
  // The number as given goes along, as the alert's link.
  const [withNr] = waterAlerts(waterAt(place({ givenNr: "5" })));
  assert.equal(withNr.href, "/adres/0972447-26555/woda?nr=5");
  assert.deepEqual(waterAlerts(waterAt(ASNYKA)), []);
});

test("alert: the whole place plainly, a part of it „w części”", () => {
  const text = (address: PlaceView, posts?: StoredPost[]) =>
    waterAlerts(waterAt(address, posts))[0]?.text;
  // The whole village and the whole street: certain.
  const dabkow = place({
    id: "0606004",
    kind: "wies",
    localityId: "0606004",
    streetId: null,
  });
  assert.equal(
    text(dabkow),
    "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
  );
  assert.equal(
    text(ZUKI),
    "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
  );
  // 39885: Załuże „Podłęże od numeru 44 do numeru 92”, a part of it.
  assert.equal(
    text(ZALUZE),
    "przerwa w dostawie w części miejscowości – środa, 28 października, 8:00–16:00.",
  );
  // A whole scope with a note is not certain either.
  const noted = cut({ ...SOBIESKIEGO_RANGE, scope: { type: "whole" } });
  assert.equal(
    text(sobieskiego(null), only(noted)),
    "przerwa w dostawie w części ulicy – poniedziałek, 26 października, 8:00–16:00.",
  );
});

test("alert: a street's range, certain only with a number inside it", () => {
  // Sobieskiego 23–47 on Monday; on Wednesday a part we cannot compare.
  const odd = cut({
    ...SOBIESKIEGO_RANGE,
    uid: "zuk-39885-2026-10-28-sobieskiego",
    date: "2026-10-28",
    start: "2026-10-28 08:00:00",
    end: "2026-10-28 16:00:00",
    scope: { type: "unknown" },
    note: "numery nieparzyste",
  });
  const text = (nr: string | null) =>
    waterAlerts(
      waterAt(sobieskiego(nr), [post({ items: [SOBIESKIEGO, odd] })]),
    )[0]?.text;
  assert.equal(
    text(null),
    "przerwa w dostawie w części ulicy – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
  );
  // task 188: the number it covers is named.
  assert.equal(
    text("30"),
    "przerwa w dostawie pod nr 30 – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
  );
  // 5 is outside 23–47: that cut is left out, so Wednesday's is the nearest.
  assert.equal(
    text("5"),
    "przerwa w dostawie w części ulicy – środa, 28 października, 8:00–16:00.",
  );
  // A streetless village's range, as 39885's Opaka 104–110.
  const opaka = (givenNr: string | null) =>
    place({
      id: "0606317",
      kind: "wies",
      localityId: "0606317",
      streetId: null,
      givenNr,
    });
  const opakaCut = post().items.find((d) => d.place.localityId === "0606317");
  assert.ok(opakaCut);
  const opakaText = (nr: string | null) =>
    waterAlerts(waterAt(opaka(nr), only(opakaCut as Disruption)))[0]?.text;
  assert.equal(
    opakaText(null),
    "przerwa w dostawie w części miejscowości – wtorek, 27 października, 8:00–16:00.",
  );
  assert.equal(
    opakaText("105"),
    "przerwa w dostawie pod nr 105 – wtorek, 27 października, 8:00–16:00.",
  );
});

test("alert slot: water before the weather, at most 2, the rest counted", () => {
  const order = (id: (typeof MODULE_IDS)[number]) => MODULE_IDS.indexOf(id);
  const weather = (from: string): Alert => ({
    text: "Silny wiatr, stopień 1 z 3.",
    href: "https://meteo.imgw.pl/",
    link: "Więcej na meteo.imgw.pl",
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
  assert.deepEqual(waterSources(waterAt(LISIE_JAMY_CICHA)), [
    [{ href: POST_URL, text: "Komunikat gminy z 23 października 2026" }],
  ]);
});

test("no cut here: no card, „Bez zapowiedzi” with the gmina's news", () => {
  const data = waterAt(SMOLINCE, []);
  assert.equal(waterSummary(data), null);
  assert.equal(waterNone(data), "brak zapowiedzianych przerw");
  assert.deepEqual(waterSources(data), [[GMINA]]);
});

test("/woda empty: a warm sentence and the gmina's news; none with a cut", () => {
  assert.deepEqual(waterEmpty(waterAt(SMOLINCE, [])), [
    "Brak zapowiedzianych przerw. Gmina ogłasza je w ",
    GMINA,
    ".",
  ]);
  assert.equal(waterEmpty(waterAt(ZUKI)), null);
});

test("sources: the town and its parts have MZGKiM too, never a village or its part", () => {
  for (const address of [ZUKI, ASNYKA, MAZURY])
    assert.deepEqual(
      sourcesAt(address.localityId).map((s) => s.id),
      ["gmina-lubaczow", "mzgkim"],
      address.id,
    );
  for (const address of [SMOLINCE, ZALUZE, LISIE_JAMY_CICHA, DABKOW_ZUKI])
    assert.deepEqual(
      sourcesAt(address.localityId).map((s) => s.id),
      ["gmina-lubaczow"],
      address.id,
    );
});

// MZGKiM's file with `posts`, read at CHECKED, as the pages get it at NOW.
const townAt = (
  address: PlaceView,
  town: StoredPost[],
  now = NOW,
  checkedAt = CHECKED,
) => water(bothViews([], checkedAt, now, town), address);
// 5237's cut (6 Oct 2026), seen on 3 Oct; 5108's (2 Jun 2026), on 1 Jun.
const OCT_3 = new Date("2026-10-03T10:00:00Z");
const OCT_3_CHECKED = "2026-10-03T09:50:00.000Z";
const JUN_1 = new Date("2026-06-01T10:00:00Z");
const JUN_1_CHECKED = "2026-06-01T09:50:00.000Z";
const NIEMIROWSKA = place({
  id: "0972447-14183",
  streetId: "0972447-14183",
});
const PIASKOWA = place({
  id: "0972447-16033",
  streetId: "0972447-16033",
});
const LESZKA_BIALEGO = place({
  id: "0972447-38139",
  streetId: "0972447-38139",
});
const SOBIESKIEGO_TOWN = place({
  id: "0972447-20431",
  streetId: "0972447-20431",
});
const POST_5237 = "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/";
const POST_5108 = "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-99/";
const OSIEDLE = "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej";
const ZA_KOLEJA = "Osiedle za Koleją";

/** 5237 with its estate line as Osiedle za Koleją, a district with no streets. */
function withZaKoleja(checkedAt: string) {
  const post = realMzgkimPost(CUT_100);
  const line =
    "<li>Osiedle domów jednorodzinnych na zapleczu</li>\n<li>ul. Niemirowskiej</li>";
  assert.ok(post.content.rendered.includes(line));
  return mzgkimPost(
    CUT_100,
    checkedAt,
    {},
    {
      ...post,
      content: {
        rendered: post.content.rendered.replace(line, `<li>${ZA_KOLEJA}</li>`),
      },
    },
    {
      ...MZGKIM_READINGS[CUT_100],
      items: MZGKIM_READINGS[CUT_100].items.map((i) =>
        i.street === OSIEDLE
          ? { ...i, street: ZA_KOLEJA, street_verbatim: ZA_KOLEJA }
          : i,
      ),
    },
  );
}

test("town, fresh, no cut: the villages' none, both sources' posts", () => {
  for (const address of [ASNYKA, MAZURY]) {
    const data = townAt(address, []);
    assert.deepEqual(data.outages, []);
    assert.equal(waterSummary(data), null);
    assert.equal(staleNote(data), null);
    assert.equal(waterNone(data), "brak zapowiedzianych przerw");
    assert.deepEqual(waterEmpty(data), [
      "Brak zapowiedzianych przerw. Gmina ogłasza je w ",
      GMINA,
      ", a MZGKiM – w ",
      { href: MZGKIM_NEWS, text: "komunikatach MZGKiM" },
      ".",
    ]);
    assert.deepEqual(waterSources(data), [[GMINA], [MZGKIM]]);
    assert.equal(
      waterLine(waterChecked(data)),
      "Komunikaty o wodzie sprawdziliśmy: 25 października, 13:20",
    );
  }
});

test("town, an MZGKiM cut: shown as a ZUK cut, its own post the source", () => {
  const cut = [mzgkimPost(CUT_100, OCT_3_CHECKED)];
  const data = townAt(NIEMIROWSKA, cut, OCT_3, OCT_3_CHECKED);
  assert.deepEqual(waterAlerts(data), [
    {
      text: "przerwa w dostawie – wtorek, 6 października, 8:30–15:00.",
      href: "/adres/0972447-14183/woda",
      link: "Więcej o tej przerwie",
      short: "MZGKiM",
      sourceHref: data.outages[0]?.source.url,
      from: "2026-10-06T08:30:00+02:00",
    },
  ]);
  assert.deepEqual(waterSummary(data), [
    ["Najbliższa przerwa", ["wtorek, 6 października, 8:30–15:00"]],
    ["Gdzie", ["cała ulica Niemirowska"]],
  ]);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_5237, text: "Komunikat MZGKiM z 2 października 2026" }],
  ]);
  assert.equal(
    data.outages[0].source.name,
    "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie",
  );
  assert.equal(
    waterAiNote(data),
    "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest komunikat MZGKiM.",
  );
  assert.equal(
    waterCalendarHint(data),
    "Plik z przerwami. Jeśli MZGKiM zmieni godziny, pobierz go jeszcze raz.",
  );
  // Its area off our list is only linked, and not here: its cut is.
  assert.deepEqual(data.notices, []);
  // "Osiedle Mazury" (the gazetteer, task 151): each of its streets, whole.
  const estate = townAt(LESZKA_BIALEGO, cut, OCT_3, OCT_3_CHECKED);
  assert.deepEqual(waterSummary(estate)?.[1], [
    "Gdzie",
    ["cała ulica Księcia Leszka Białego"],
  ]);
  // TERYT's part Mazury (no address) is no longer cut.
  assert.deepEqual(townAt(MAZURY, cut, OCT_3, OCT_3_CHECKED).outages, []);
});

test("town, a bare 'Mazury' read as the street: one line, on its estate's streets only", () => {
  // 5108's cuts (Sobieskiego, Niemirowska, Starzyny) with doubts as the
  // gate writes them (lib/zuk.ts): each with its district's streets, from
  // the gazetteer.
  const streetsOf = (key: string) =>
    DISTRICTS.find((d) => d.id === key)?.streets.map((s) => s.id) ?? [];
  const mazury = { words: "Mazury", streetIds: streetsOf("mazury") };
  const piaski = { words: "Piaski", streetIds: streetsOf("piaski") };
  const at = (address: PlaceView, doubts = [mazury, piaski]) =>
    townAt(
      address,
      [{ ...mzgkimPost(CUT_99, JUN_1_CHECKED), doubts }],
      JUN_1,
      JUN_1_CHECKED,
    ).notices.filter((n) => n.doubt);
  // A street of Osiedle Mazury: the line, naming Mazury only.
  const [line] = at(LESZKA_BIALEGO);
  assert.deepEqual(noticeLink(line), {
    href: POST_5108,
    text: "MZGKiM pisze tylko „Mazury”, więc nie wiemy na pewno, czy chodzi o ulicę, czy o całe osiedle – zajrzyj do komunikatu",
    hidden: "„Przerwa w dostawie wody”",
  });
  // A street of Osiedle Piaski: Piaski only.
  assert.deepEqual(
    at(PIASKOWA).flatMap((n) => n.doubt?.map((d) => d.words)),
    ["Piaski"],
  );
  // Any other town street, and the town's part: never.
  for (const address of [ASNYKA, MAZURY]) assert.deepEqual(at(address), []);
  // A street of both (none in the seed): both names, plural.
  assert.deepEqual(
    noticeLink({
      ...line,
      doubt: [
        mazury,
        { ...piaski, streetIds: [LESZKA_BIALEGO.streetId as string] },
      ],
    }),
    {
      href: POST_5108,
      text: "MZGKiM pisze tylko „Mazury” i „Piaski”, więc nie wiemy na pewno, czy chodzi o ulice, czy o całe osiedla – zajrzyj do komunikatu",
      hidden: "„Przerwa w dostawie wody”",
    },
  );
  assert.equal(
    at(LESZKA_BIALEGO, [
      mazury,
      { ...piaski, streetIds: [LESZKA_BIALEGO.streetId as string] },
    ])[0].doubt?.length,
    2,
  );
});

test("town, an MZGKiM area off our list: a link on every other town page", () => {
  const cut = [withZaKoleja(OCT_3_CHECKED)];
  const data = townAt(ASNYKA, cut, OCT_3, OCT_3_CHECKED);
  assert.deepEqual(data.outages, []);
  assert.deepEqual(waterSummary(data), [
    [
      "Komunikat",
      [
        {
          href: POST_5237,
          text: `MZGKiM ogłosił też przerwę w miejscu, którego nie umiemy dopasować do adresów: „${ZA_KOLEJA}” – sprawdź komunikat`,
          hidden: "„Przerwa w dostawie wody”",
        },
      ],
    ],
  ]);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_5237, text: "Komunikat MZGKiM z 2 października 2026" }],
  ]);
  // Never in a village.
  assert.deepEqual(townAt(SMOLINCE, cut, OCT_3, OCT_3_CHECKED).notices, []);
});

test("town, an MZGKiM street in part: „w części ulicy”, its words as written", () => {
  const cut = [mzgkimPost(CUT_99, JUN_1_CHECKED)];
  const data = townAt(SOBIESKIEGO_TOWN, cut, JUN_1, JUN_1_CHECKED);
  assert.equal(
    waterAlerts(data)[0].text,
    "przerwa w dostawie w części ulicy – wtorek, 2 czerwca, 8:30–13:00.",
  );
  assert.deepEqual(waterSummary(data)?.[1], [
    "Gdzie",
    [
      "ulica Jana III Sobieskiego: od siedziby Straży Pożarnej w kierunku Dąbrowy",
    ],
  ]);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_5108, text: "Komunikat MZGKiM z 1 czerwca 2026" }],
  ]);
  // Never a village's Sobieskiego, nor Dąbrowa (only a direction).
  const basznia = place({
    id: "0605890-20431",
    localityId: "0605890",
    streetId: "0605890-20431",
  });
  assert.deepEqual(townAt(basznia, cut, JUN_1, JUN_1_CHECKED).outages, []);
});

test("town, a ZUK cut: its post the only „Źródło”, never MZGKiM's page", () => {
  const data = waterAt(ZUKI);
  assert.deepEqual(waterSummary(data), [
    ["Najbliższa przerwa", ["wtorek, 27 października, 8:00–16:00"]],
    ["Gdzie", ["cała ulica Żuki"]],
  ]);
  assert.equal(waterAlerts(data)[0].short, "ZUK Mokrzyca");
  assert.equal(waterEmpty(data), null);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_URL, text: "Komunikat gminy z 23 października 2026" }],
  ]);
  assert.equal(waterAiNote(data), WATER_AI_NOTE);
});

test("town, both sources' cuts: both posts, both in the AI note", () => {
  // 5237's Niemirowska cut moved to 28 Oct and to ul. Żuki (made up).
  const [, niemirowska] = mzgkimPost(CUT_100, CHECKED).items;
  const town = mzgkimPost(CUT_100, CHECKED, {
    items: [
      {
        ...niemirowska,
        date: "2026-10-28",
        start: "2026-10-28 08:30:00",
        end: "2026-10-28 15:00:00",
        place: { localityId: "0972447", streetId: "0972447-26555" },
      },
    ],
  });
  const both = water(bothViews([post()], CHECKED, NOW, [town]), ZUKI);
  assert.deepEqual(
    both.outages.map((d) => [d.date, d.uid.split("-")[0]]),
    [
      ["2026-10-27", "zuk"],
      ["2026-10-28", "mzgkim"],
    ],
  );
  assert.equal(
    waterAiNote(both),
    "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejsze są komunikaty gminy i MZGKiM.",
  );
  assert.equal(
    waterCalendarHint(both),
    "Plik z przerwami. Jeśli gmina lub MZGKiM zmieni godziny, pobierz go jeszcze raz.",
  );
  assert.equal(waterSources(both).length, 2);
});

/**
 * A town street without a cut and ul. Żuki with ZUK's, from `views`: no
 * cut, both sources' posts and the oldest read in the checked line.
 */
function quietAndCut(views: Parameters<typeof water>[0]) {
  const quiet = water(views, ASNYKA);
  assert.deepEqual(waterSources(quiet), [[GMINA], [MZGKIM]]);
  assert.equal(waterChecked(quiet)?.toISOString(), CHECKED);
  return { quiet, cut: water(views, ZUKI) };
}

test("town, MZGKiM stale: „przy ostatnim sprawdzeniu”, its posts named", () => {
  const late = new Date(Date.parse(CHECKED) + STALE_MS + 1);
  const views = {
    "gmina-lubaczow": zukView(zukFile([post()], late.toISOString()), late),
    mzgkim: zukView(zukFile([], CHECKED), late, MZGKIM_SOURCE),
  };
  const { quiet, cut } = quietAndCut(views);
  assert.equal(
    waterNone(quiet),
    "brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych komunikatów MZGKiM",
  );
  assert.deepEqual(staleNote(quiet), [
    "Od ponad godziny nie udało się nam sprawdzić nowych komunikatów MZGKiM. Zajrzyj też do ",
    MZGKIM_OF,
    ".",
  ]);
  // A ZUK cut: the note joins the card, the source is still its post only.
  assert.deepEqual(waterSummary(cut)?.at(-1), ["Uwaga", staleNote(cut)]);
  assert.deepEqual(waterSources(cut), [
    [{ href: POST_URL, text: "Komunikat gminy z 23 października 2026" }],
  ]);
});

test("town, both stale: as a village, both sources' posts", () => {
  const late = new Date(Date.parse(CHECKED) + STALE_MS + 1);
  const quiet = waterAt(ASNYKA, [post()], late);
  assert.equal(
    waterNone(quiet),
    "brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych",
  );
  assert.deepEqual(staleNote(quiet), [
    "Od ponad godziny nie udało się nam sprawdzić nowych komunikatów. Zajrzyj też do ",
    GMINA,
    " i ",
    MZGKIM_OF,
    ".",
  ]);
});

test("town, MZGKiM unavailable: said, with its posts; the gmina's none kept", () => {
  const views = { "gmina-lubaczow": zukView(zukFile([post()], CHECKED), NOW) };
  const { quiet, cut } = quietAndCut(views);
  assert.equal(
    waterNone(quiet),
    "nie udało się nam sprawdzić komunikatów MZGKiM",
  );
  assert.deepEqual(waterEmpty(quiet), [
    "Brak zapowiedzianych przerw. Gmina ogłasza je w ",
    GMINA,
    ". Nie udało się nam jednak teraz sprawdzić komunikatów MZGKiM. Zajrzyj do ",
    MZGKIM_OF,
    ".",
  ]);
  assert.equal(staleNote(quiet), null);
  // Beside a ZUK cut: the note says it.
  assert.deepEqual(staleNote(cut), [
    "Nie udało się nam teraz sprawdzić komunikatów MZGKiM. Zajrzyj też do ",
    MZGKIM_OF,
    ".",
  ]);
  assert.deepEqual(waterSummary(cut)?.at(-1), ["Uwaga", staleNote(cut)]);
});

test("town, no file at all: the gmina's and MZGKiM's posts to check", () => {
  for (const address of [ZUKI, MAZURY]) {
    const data = water({}, address);
    assert.equal(waterNone(data), "nie udało się nam sprawdzić komunikatów");
    assert.deepEqual(waterEmpty(data), [
      "Nie udało się nam teraz sprawdzić komunikatów o wodzie. Zajrzyj do ",
      GMINA,
      " i ",
      MZGKIM_OF,
      ".",
    ]);
    assert.deepEqual(waterSources(data), [[GMINA], [MZGKIM]]);
    assert.equal(waterChecked(data), null);
  }
});

test("freshness: the checked line always, the stale note only after 1 h", () => {
  const checked = Date.parse(CHECKED);
  const at = (ms: number) =>
    waterAt(ZUKI, [post()], new Date(checked + ms), CHECKED);
  const fresh = at(STALE_MS);
  assert.equal(
    waterLine(waterChecked(fresh)),
    "Komunikaty o wodzie sprawdziliśmy: 25 października, 13:20",
  );
  assert.equal(staleNote(fresh), null);
  assert.equal(waterSummary(fresh)?.length, 2);

  const stale = at(STALE_MS + 1);
  assert.equal(
    waterLine(waterChecked(stale)),
    "Komunikaty o wodzie sprawdziliśmy: 25 października, 13:20",
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

test("no file: the gmina's news only, no cut, no checked line", () => {
  const data = water({}, SMOLINCE);
  assert.deepEqual(data.outages, []);
  assert.equal(waterSummary(data), null);
  assert.deepEqual(waterAlerts(data), []);
  assert.equal(waterChecked(data), null);
  assert.equal(staleNote(data), null);
  assert.equal(waterNone(data), "nie udało się nam sprawdzić komunikatów");
  assert.deepEqual(waterSources(data), [[GMINA]]);
  assert.deepEqual(waterEmpty(data), [
    "Nie udało się nam teraz sprawdzić komunikatów o wodzie. Zajrzyj do ",
    GMINA,
    ".",
  ]);
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

test("notices: a village's notice is listed on its parts", () => {
  const notice = post({
    status: "notice",
    reason: "ambiguous",
    items: [],
    localityIds: ["0606234"],
  });
  const smolince = place({
    id: "0606257",
    kind: "wies",
    localityId: "0606257",
    streetId: null,
  });
  assert.equal(waterAt(smolince, [notice]).notices.length, 1);
  // Not the other way: a part's notice is not its village's.
  const partNotice = post({ ...notice, localityIds: ["0606257"] });
  const lisieJamy = place({
    id: "0606234",
    kind: "wies",
    localityId: "0606234",
    streetId: null,
  });
  assert.deepEqual(waterAt(lisieJamy, [partNotice]).notices, []);
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

test("dev mock: MZGKiM's 5237 moved to now, its cut the day after tomorrow", () => {
  const now = NOW.getTime();
  const fresh = mockFile("5237", now);
  const stale = mockFile("5237-stale", now);
  assert.ok(fresh && stale);
  assert.equal(zukView(stale, NOW, MZGKIM_SOURCE).stale, true);
  const view = zukView(fresh, NOW, MZGKIM_SOURCE);
  assert.equal(view.stale, false);
  // Sunday 25 Oct: Tuesday 27 Oct, 8:30-15:00, as the moved text says.
  const data = water(
    { "gmina-lubaczow": zukView(zukFile([], CHECKED), NOW), mzgkim: view },
    NIEMIROWSKA,
  );
  assert.deepEqual(waterSummary(data)?.slice(0, 2), [
    ["Najbliższa przerwa", ["wtorek, 27 października, 8:30–15:00"]],
    ["Gdzie", ["cała ulica Niemirowska"]],
  ]);
  // Starzyny swapped for Asnyka, a street of the CI fixture.
  const asnyka = water(
    { "gmina-lubaczow": zukView(zukFile([], CHECKED), NOW), mzgkim: view },
    ASNYKA,
  );
  assert.equal(asnyka.outages.length, 1);
  assert.equal(asnyka.outages[0].label?.street, "Adama Asnyka");
  assert.equal(mockFile("5238", now), undefined);
});

// Task 188: partial cuts on village, part and /nr pages.

const village = (id: string, name: string, givenNr: string | null = null) =>
  place({ id, kind: "wies", name, localityId: id, streetId: null, givenNr });
const LISIE_JAMY = village("0606234", "Lisie Jamy");
const MLODOW = village("0606286", "Młodów");
const CZARNE = village("0606470", "Czarne");
const MOCZAR_DUZY = village("0606487", "Moczar Duży");
const MOCZAR_MALY = village("0606493", "Moczar Mały");

/** 39885 as edited on 26.10: Lisie Jamy's four streets on 27.10, 8-12. */
const edited = () => {
  const read = readPost(
    POST_39885_EDITED,
    reading39885Edited(),
    PLACES,
    CHECKED,
  ) as Extract<PostReading, { status: "parsed" }>;
  return post({ items: read.items });
};

/** A made-up cut on a Lisie Jamy street, 27 Oct 8:00-12:00, in 39885. */
const lisieStreet = (sym: string, street: string, over = {}): Disruption =>
  cut({
    uid: `zuk-39885-2026-10-27-0606234-${sym}`,
    date: "2026-10-27",
    start: "2026-10-27 08:00:00",
    end: "2026-10-27 12:00:00",
    place: { localityId: "0606234", streetId: `0606234-${sym}` },
    label: { locality: "Lisie Jamy", parent: null, street },
    where: `ul. ${street}`,
    scope: { type: "whole" },
    note: null,
    ...over,
  });
const FOUR = [
  lisieStreet("03839", "Długa"),
  lisieStreet("23795", "Wąska"),
  lisieStreet("10898", "Leśna"),
  lisieStreet("26081", "Zielona"),
];

test("village: its streets' cuts of one post and hours as one, „w części”", () => {
  const data = waterAt(
    LISIE_JAMY,
    only(FOUR[0] as Disruption).map((p) => ({
      ...p,
      items: FOUR,
    })),
  );
  assert.equal(data.outages.length, 1);
  const [group] = data.outages as [Cut];
  assert.equal(
    group.uid,
    "zuk-39885-2026-10-27-0606234-03839-ulice-planned-0800",
  );
  assert.deepEqual(group.place, { localityId: "0606234", streetId: null });
  assert.equal(
    scope(group),
    "część miejscowości Lisie Jamy: ulice Długa, Wąska, Leśna i Zielona",
  );
  assert.equal(
    waterAlerts(data)[0]?.text,
    "przerwa w dostawie w części miejscowości – wtorek, 27 października, 8:00–12:00.",
  );
  // A number on a village page: we cannot tell its street, so shown.
  const five = waterAt({ ...LISIE_JAMY, givenNr: "5" }, [
    post({ items: FOUR }),
  ]);
  assert.deepEqual(
    five.outages.map((d) => d.uid),
    [group.uid],
  );
  assert.equal(
    waterAlerts(five)[0]?.text,
    "przerwa w dostawie w części miejscowości – wtorek, 27 października, 8:00–12:00.",
  );
  // Street pages: their own cut, as before.
  const dluga = place({
    id: "0606234-03839",
    localityId: "0606234",
    streetId: "0606234-03839",
  });
  assert.deepEqual(
    waterAt(dluga, [post({ items: FOUR })]).outages.map((d) => d.uid),
    ["zuk-39885-2026-10-27-0606234-03839"],
  );
});

test("village: 39885 as edited, the group on 27.10, the whole village on 29.10", () => {
  // QA time: Tuesday 27 Oct, 6:00 in Warsaw.
  const data = waterAt(
    LISIE_JAMY,
    [edited()],
    new Date("2026-10-27T05:00:00Z"),
    "2026-10-27T04:50:00.000Z",
  );
  assert.deepEqual(
    data.outages.map((d) => [d.date, scope(d)]),
    [
      [
        "2026-10-27",
        "część miejscowości Lisie Jamy: ulice Długa, Wąska, Leśna i Zielona",
      ],
      ["2026-10-29", "cała miejscowość Lisie Jamy"],
    ],
  );
  assert.equal(
    waterAlerts(data)[0]?.text,
    "przerwa w dostawie w części miejscowości – wtorek, 27 października, 8:00–12:00 (i jeszcze 1 dzień).",
  );
  assert.deepEqual(waterSummary(data)?.slice(0, 2), [
    ["Najbliższa przerwa", ["wtorek, 27 października, 8:00–12:00"]],
    [
      "Gdzie",
      ["część miejscowości Lisie Jamy: ulice Długa, Wąska, Leśna i Zielona"],
    ],
  ]);
});

test("village: a whole-village cut in the same slot hides the group; notes kept", () => {
  const whole = cut({
    ...(FOUR[0] as Disruption),
    uid: "zuk-39885-2026-10-27-0606234",
    place: { localityId: "0606234", streetId: null },
    label: { locality: "Lisie Jamy", parent: null, street: null },
  });
  assert.deepEqual(
    waterAt(LISIE_JAMY, [post({ items: [whole, ...FOUR] })]).outages.map(
      (d) => d.uid,
    ),
    [whole.uid],
  );
  const lwowska = lisieStreet("11467", "Lwowska", {
    scope: { type: "ranges", ranges: [{ from: "26", to: "42" }] },
    note: "od nr 26 do nr 42",
  });
  const [group] = waterAt(LISIE_JAMY, [
    post({ items: [FOUR[0] as Disruption, lwowska] }),
  ]).outages;
  assert.equal(
    scope(group as Cut),
    "część miejscowości Lisie Jamy: ulice Długa i Lwowska (od nr 26 do nr 42)",
  );
  // Another post, or other hours: a group of its own.
  const later = lisieStreet("23795", "Wąska", {
    uid: "zuk-39885-2026-10-27-0606234-23795",
    start: "2026-10-27 12:00:00",
    end: "2026-10-27 14:00:00",
  });
  assert.deepEqual(
    waterAt(LISIE_JAMY, [
      post({ items: [FOUR[0] as Disruption, later] }),
    ]).outages.map((d) => d.uid),
    [
      "zuk-39885-2026-10-27-0606234-03839-ulice-planned-0800",
      "zuk-39885-2026-10-27-0606234-23795-ulice-planned-1200",
    ],
  );
});

test("village: never a parent's streets, never a town street on its part", () => {
  const posts = [post({ items: FOUR })];
  assert.deepEqual(waterAt(SMOLINCE, posts).outages, []);
  const zukiInTown = post().items.find(
    (d) => d.place.streetId === "0972447-26555",
  );
  assert.ok(zukiInTown);
  assert.equal(matches(MAZURY, zukiInTown), false);
  assert.deepEqual(waterAt(MAZURY).outages, []);
});

test("village: 39885's Młodów shows its ul. Pilipy on 28.10", () => {
  const data = waterAt(MLODOW);
  assert.deepEqual(
    data.outages.map((d) => [d.date, scope(d)]),
    [["2026-10-28", "część miejscowości Młodów: ulica Pilipy"]],
  );
  assert.equal(
    waterAlerts(data)[0]?.text,
    "przerwa w dostawie w części miejscowości – środa, 28 października, 8:00–16:00.",
  );
});

test("part: its village's partial cut, the village named, a hint to check", () => {
  for (const [part, nr] of [
    [CZARNE, null],
    [CZARNE, "10"],
    [CZARNE, "50"],
    [MOCZAR_DUZY, null],
    [MOCZAR_MALY, null],
  ] as Array<[PlaceView, string | null]>) {
    const data = waterAt({ ...part, givenNr: nr });
    const label = `${part.name} ${nr}`;
    assert.deepEqual(
      data.outages.map((d) => d.uid),
      ["zuk-39885-2026-10-28-0606464"],
      label,
    );
    assert.deepEqual(data.hidden, [], label);
    assert.equal(
      waterAlerts(data)[0]?.text,
      "przerwa w dostawie w części miejscowości Załuże – środa, 28 października, 8:00–16:00.",
      label,
    );
    assert.deepEqual(
      waterSummary(data),
      [
        ["Najbliższa przerwa", ["środa, 28 października, 8:00–16:00"]],
        ["Gdzie", ["Załuże: Podłęże od numeru 44 do numeru 92"]],
        [
          "Sprawdź",
          [
            `${part.name} należy do miejscowości Załuże, a komunikat dotyczy tylko jej części. Sprawdź, czy obejmuje Twój dom. Zobacz `,
            { href: "/adres/0606464", text: "stronę miejscowości Załuże" },
            ".",
          ],
        ],
      ],
      label,
    );
  }
});

test("part: Opaka's 104–110 reaches Żuki, Kamienna and Tuczarnia", () => {
  for (const [id, name] of [
    ["0606346", "Żuki"],
    ["0606323", "Kamienna"],
    ["0606330", "Tuczarnia"],
  ]) {
    for (const nr of [null, "5", "105"]) {
      const data = waterAt(village(id, name, nr));
      assert.deepEqual(
        data.outages.map((d) => d.uid),
        ["zuk-39885-2026-10-27-0606317"],
        `${name} ${nr}`,
      );
      assert.equal(
        waterAlerts(data)[0]?.text,
        "przerwa w dostawie w części miejscowości Opaka – wtorek, 27 października, 8:00–16:00.",
      );
      assert.equal(waterSummary(data)?.[2]?.[0], "Sprawdź");
    }
  }
  // Opaka itself: filtered by its number, as ever.
  const opaka = (nr: string) => waterAt(village("0606317", "Opaka", nr));
  assert.equal(opaka("5").outages.length, 0);
  assert.equal(opaka("105").outages.length, 1);
});

test("part: a whole village's cut stays plain, no hint", () => {
  const data = waterAt(SMOLINCE);
  assert.equal(
    waterAlerts(data)[0]?.text,
    "przerwa w dostawie – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
  );
  assert.ok(!waterSummary(data)?.some(([key]) => key === "Sprawdź"));
});

test("nr: a cut that covers it says so; one that leaves it out, in the card", () => {
  const zaluze = (nr: string) => waterAt({ ...ZALUZE, givenNr: nr });
  assert.deepEqual(waterSummary(zaluze("44"))?.[1], [
    "Gdzie",
    ["Załuże: Podłęże od numeru 44 do numeru 92 (obejmuje nr 44)"],
  ]);
  const [only44] = zaluze("44").outages;
  assert.equal(
    cutWhere(only44 as Cut, zaluze("44").place),
    "Załuże: Podłęże od numeru 44 do numeru 92 (obejmuje nr 44)",
  );
  const data = zaluze("43");
  assert.deepEqual(waterSummary(data), [
    ["Pod nr 43", ["Brak zapowiedzianych przerw."]],
    [
      "Inne numery",
      [
        "Gmina zapowiedziała przerwę w tej miejscowości – środa, 28 października, 8:00–16:00 – ale według komunikatu nie obejmuje nr 43.",
      ],
    ],
  ]);
  // Stale: a full sentence too, and no second „Uwaga” row.
  const late = waterAt(
    { ...ZALUZE, givenNr: "43" },
    [post()],
    new Date(Date.parse(CHECKED) + STALE_MS + 1),
  );
  assert.deepEqual(waterSummary(late)?.[0], [
    "Pod nr 43",
    [
      "Brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych.",
    ],
  ]);
  assert.equal(waterSummary(late)?.length, 2);
  // The hub: the card says it, so no trace; /woda keeps its trace line.
  assert.equal(MODULES.woda.trace?.(data), null);
  assert.equal(
    waterTrace(data),
    "Gmina zapowiedziała też przerwę w tej miejscowości, ale według komunikatu nie obejmuje nr 43.",
  );
  // A cut shown and another left out: the trace under the card.
  const sob = cut({ ...SOBIESKIEGO_RANGE });
  const wholeLater = cut({
    ...SOBIESKIEGO_RANGE,
    uid: "zuk-39885-2026-10-28-sobieskiego",
    date: "2026-10-28",
    start: "2026-10-28 08:00:00",
    end: "2026-10-28 16:00:00",
    scope: { type: "whole" },
    note: null,
  });
  const both = waterAt(sobieskiego("5"), [post({ items: [sob, wholeLater] })]);
  assert.equal(both.outages.length, 1);
  assert.equal(
    MODULES.woda.trace?.(both),
    "Gmina zapowiedziała też przerwę na tej ulicy, ale według komunikatu nie obejmuje nr 5.",
  );
});

test("part streets: every key a TERYT part, every street its village's", () => {
  const localities = new Map(ZUK_PLACES.localities.map((l) => [l.id, l]));
  for (const [partId, streetIds] of PART_STREETS) {
    const part = localities.get(partId);
    assert.ok(part?.parentId, partId);
    for (const id of streetIds) {
      const street = ZUK_PLACES.streets.find((s) => s.id === id);
      assert.equal(street?.localityId, part.parentId, id);
    }
  }
});

test("village: its own cut in part and the gate's street copies, shown once", () => {
  // A cut on Lisie Jamy „częściowo”: the gate puts it on the village and
  // on every street of its own; the village page shows the village's.
  const base = post().items[0] as Disruption;
  const items = [
    lisiePartly(base, null),
    lisiePartly(base, "0606234-03839", "Długa"),
    lisiePartly(base, "0606234-23795", "Wąska"),
  ];
  const data = waterAt(LISIE_JAMY, [post({ items })]);
  assert.deepEqual(
    data.outages.map((d) => scope(d)),
    ["Lisie Jamy: częściowo"],
  );
  // Another post's street cut in the same slot is still its own group.
  const other = cut({
    ...(FOUR[0] as Disruption),
    uid: "zuk-40001-2026-10-27-0606234-03839",
  });
  assert.deepEqual(
    waterAt(LISIE_JAMY, [post({ items: [...items, other] })]).outages.map(
      (d) => d.uid,
    ),
    [
      "zuk-39885-2026-10-27-0606234",
      "zuk-40001-2026-10-27-0606234-03839-ulice-planned-0800",
    ],
  );
});

test("village: a planned and an emergency group of one post and slot stay apart", () => {
  const emergency = lisieStreet("03839", "Długa", {
    uid: "zuk-39885-2026-10-27-0606234-03839-e",
    cause: "emergency",
  });
  assert.deepEqual(
    waterAt(LISIE_JAMY, [
      post({ items: [FOUR[0] as Disruption, emergency] }),
    ]).outages.map((d) => d.uid),
    [
      "zuk-39885-2026-10-27-0606234-03839-ulice-planned-0800",
      "zuk-39885-2026-10-27-0606234-03839-e-ulice-emergency-0800",
    ],
  );
});
