import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_IDS } from "./address-routes.ts";
import type { Disruption } from "./disruptions.ts";
import { type Alert, alertSlot, checkedLine } from "./hub.ts";
import type { PlaceView } from "./schedule.ts";
import {
  KROWICA_RANGE,
  mockFile,
  POST_39885,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
  zukFile,
} from "./water-fixture.ts";
import {
  GMINA_NEWS,
  inTown,
  MZGKIM_NEWS,
  matches,
  outsideRange,
  scope,
  staleNote,
  type Water,
  water,
  waterAlerts,
  waterChecked,
  waterEmpty,
  waterNone,
  waterSources,
  waterSummary,
  waterTrace,
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
  assert.equal(matches(PILIPY_PART, villageStreet), false);
  // 39885's „Młodów ul. Pilipy” is Młodów's street, not the part.
  assert.deepEqual(waterAt(PILIPY_PART).outages, []);
});

test("matching: a village part never takes its village's partial cuts", () => {
  const village = { localityId: "0606286", streetId: null };
  for (const [name, over] of [
    ["w części", { scope: { type: "unknown" } }],
    ["ranges", { scope: { type: "ranges", ranges: [{ from: "1", to: "9" }] } }],
    ["numbers", { scope: { type: "numbers", numbers: ["5"] } }],
    ["note", { note: "gospodarstwa zasilane z SUW Mokrzyca" }],
    ["street", { place: { ...village, streetId: "0606286-39507" } }],
  ] as Array<[string, Partial<Disruption>]>)
    assert.equal(
      matches(PILIPY_PART, cut({ place: village, ...over })),
      false,
      name,
    );
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
  assert.equal(waterSummary(five), null);
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

test("alert: the nearest cut, an absolute date, the subpage, the source", () => {
  assert.deepEqual(waterAlerts(waterAt(ZUKI)), [
    {
      text: "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
      href: "/adres/0972447-26555/woda",
      link: "Więcej o tej przerwie",
      short: "ZUK Mokrzyca",
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
  assert.equal(
    text("30"),
    "przerwa w dostawie – poniedziałek, 26 października, 8:00–16:00 (i jeszcze 1 dzień).",
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
    "przerwa w dostawie – wtorek, 27 października, 8:00–16:00.",
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
  assert.equal(waterNone(data), "brak zapowiedzianych przerw w dostawie");
  assert.deepEqual(waterSources(data), [[GMINA]]);
});

test("/woda empty: a warm sentence and the gmina's news; none with a cut", () => {
  assert.deepEqual(waterEmpty(waterAt(SMOLINCE, [])), [
    "Nie wiemy o żadnej zapowiedzianej przerwie w dostawie wody pod tym adresem. Gmina ogłasza je w ",
    GMINA,
    ".",
  ]);
  assert.equal(waterEmpty(waterAt(ZUKI)), null);
});

test("town: the town and its parts from TERYT, never a village or its part", () => {
  for (const address of [ZUKI, ASNYKA, MAZURY])
    assert.equal(inTown({ place: address }), true, address.id);
  for (const address of [SMOLINCE, ZALUZE, LISIE_JAMY_CICHA, DABKOW_ZUKI])
    assert.equal(inTown({ place: address }), false, address.id);
});

test("town, no cut: the gmina's none, MZGKiM's posts not read yet", () => {
  for (const address of [ASNYKA, MAZURY]) {
    const data = waterAt(address);
    assert.deepEqual(data.outages, []);
    assert.equal(waterSummary(data), null);
    assert.equal(
      waterNone(data),
      "gmina nie zapowiada przerw, ale w mieście przerwy ogłasza też MZGKiM – tych komunikatów jeszcze nie sprawdzamy",
    );
    assert.deepEqual(waterEmpty(data), [
      "Gmina nie zapowiada przerw pod tym adresem. W mieście przerwy w dostawie wody ogłasza też MZGKiM, a jego komunikatów jeszcze tu nie pokazujemy. Sprawdź ",
      MZGKIM,
      " i ",
      GMINA,
      ".",
    ]);
    assert.deepEqual(waterSources(data), [[GMINA], [MZGKIM]]);
  }
});

test("town, a ZUK cut: shown as anywhere, MZGKiM's posts after its post", () => {
  const data = waterAt(ZUKI);
  assert.deepEqual(waterSummary(data), [
    ["Najbliższa przerwa", ["wtorek, 27 października, 8:00–16:00"]],
    ["Gdzie", ["cała ulica Żuki"]],
  ]);
  assert.equal(waterAlerts(data).length, 1);
  assert.equal(waterEmpty(data), null);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_URL, text: "Komunikat gminy z 23 października 2026" }],
    [MZGKIM],
  ]);
});

test("town, stale: its own none text, MZGKiM's posts in the note", () => {
  const late = new Date(Date.parse(CHECKED) + STALE_MS + 1);
  const quiet = waterAt(ASNYKA, [post()], late);
  assert.match(waterNone(quiet), /przy ostatnim sprawdzeniu/);
  assert.deepEqual(staleNote(quiet), [
    "Od ponad godziny nie udało się nam sprawdzić nowych komunikatów. Zajrzyj też do ",
    GMINA,
    " i ",
    MZGKIM_OF,
    ".",
  ]);
  assert.deepEqual(waterSources(quiet), [[GMINA], [MZGKIM]]);
  // With the cut, the note joins the card as before.
  const cut = waterAt(ZUKI, [post()], late);
  assert.deepEqual(waterSummary(cut)?.at(-1), ["Uwaga", staleNote(cut)]);
});

test("town, no file: the gmina's and MZGKiM's posts to check", () => {
  for (const address of [ZUKI, MAZURY]) {
    const data = water(zukView(null, NOW), address);
    assert.equal(waterNone(data), "nie udało się nam sprawdzić komunikatów");
    assert.deepEqual(waterEmpty(data), [
      "Nie udało się nam teraz sprawdzić komunikatów o wodzie. Zajrzyj do ",
      GMINA,
      " i ",
      MZGKIM_OF,
      ".",
    ]);
    assert.deepEqual(waterSources(data), [[GMINA], [MZGKIM]]);
  }
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
  const data = water(zukView(null, NOW), SMOLINCE);
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
