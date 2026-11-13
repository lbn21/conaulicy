import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import { DISTRICTS } from "./districts-seed.ts";

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
  CHECKED,
  KROWICA_RANGE,
  lisiePartly,
  mockFile,
  mzgkimPost,
  NOW,
  POST_39885,
  POST_39885_URL as POST_URL,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
  zukFile,
} from "./water-fixture.ts";
import {
  aiNote,
  type Cut,
  cutWhere,
  GMINA_NEWS,
  MZGKIM_NEWS,
  matches,
  noticeLink,
  scope,
  staleNote,
  type Water,
  water,
  waterAiNote,
  waterCalendarRefresh,
  waterEmpty,
  waterNone,
  waterSources,
  waterStatus,
  waterUpcoming,
} from "./water-module.ts";
import {
  GMINA as GMINA_SOURCE,
  MZGKIM as MZGKIM_SOURCE,
  sourcesAt,
} from "./water-sources.ts";
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

/** The block's first water item's second sentence: where. */
const whereOf = (data: Water) => waterUpcoming(data)[0]?.second;

/** The section's lines, its groups flattened. */
const lines = (data: Water) => waterStatus(data).flat();

const place = testPlace;
/** A village or a part of one, by its SIMC id. */
const village = (id: string, name: string) =>
  place({ id, kind: "wies", name, localityId: id, streetId: null });

const ZUKI = place({});
const ASNYKA = place({ id: "0972447-00470", streetId: "0972447-00470" });
// Dąbków's own ul. Żuki (made up): the same SYM_UL, another locality.
const DABKOW_ZUKI = place({
  id: "0606004-26555",
  localityId: "0606004",
  streetId: "0606004-26555",
});
const ZALUZE = village("0606464", "Załuże");
const LISIE_JAMY_CICHA = place({
  id: "0606234-02974",
  localityId: "0606234",
  streetId: "0606234-02974",
});
// Pilipy, a part of Młodów (SIMC 0606300); Młodów also has a ul. Pilipy.
const PILIPY_PART = village("0606300", "Pilipy");

// Smolińce, a part of Lisie Jamy: a village, outside MZGKiM's area.
const SMOLINCE = village("0606257", "Smolińce");
// Mazury, a part of the town.
const MAZURY = village("0972453", "Mazury");

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
  // Every Pilipy address is „Młodów, ul. Pilipy N” (PRG), so the
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
  // The notices never repeat it: the timeline lists the cut.
  assert.deepEqual(lines(waterAt(PILIPY_PART)), []);
  // In part: „w części ulicy Pilipy”, the street's words with its village.
  const pilipyPart = cut({
    ...villageStreet,
    label: { locality: "Młodów", parent: null, street: "Pilipy" },
    scope: { type: "unknown" },
    note: "od nr 1 do nr 9",
  });
  const inPart = waterAt(PILIPY_PART, only(pilipyPart));
  assert.equal(
    whereOf(inPart),
    "Część ulicy – których domów dotyczy, sprawdź w szczegółach.",
  );
  assert.equal(
    cutWhere(inPart.outages[0] as Cut, PILIPY_PART),
    "ulica Pilipy w Młodowie: od nr 1 do nr 9",
  );
  assert.equal(whereOf(waterAt(PILIPY_PART)), "Cała ulica Pilipy.");
});

// A part gets
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
    const data = waterAt(PILIPY_PART, only(partial));
    assert.equal(data.outages.length, 1, name);
    assert.equal(
      whereOf(data),
      "Część wsi Młodów – może nie obejmować tej miejscowości. Sprawdź niżej.",
      name,
    );
  }
});

test("matching: 39885's whole villages reach their parts, one cut a day", () => {
  const BASZNIA = village("0605909", "Basznia");
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
    "cała wieś Lisie Jamy",
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

test("matching: house numbers in a village with streets, the village and every street", () => {
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
  // A village's range in a village with streets: on the village and on
  // its streets.
  const krowicaSama = village("0606180", "Krowica Sama");
  const street = place({
    id: "0606180-51473",
    localityId: "0606180",
    streetId: "0606180-51473",
  });
  for (const address of [krowicaSama, street])
    assert.deepEqual(waterAt(address, [post({ items: [krowica] })]).outages, [
      krowica,
    ]);
});

const only = (item: Disruption) => [post({ items: [item] })];

const ZUKI_CUT = { localityId: "0972447", streetId: "0972447-26555" };

test("timeline: every cut its own item, its span from the wall times", () => {
  assert.deepEqual(waterUpcoming(waterAt(ZUKI)), [
    {
      module: "woda",
      span: {
        start: "2026-10-27T08:00:00+01:00",
        end: "2026-10-27T16:00:00+01:00",
        day: "2026-10-27",
        endDay: "2026-10-27",
        from: "8:00",
        to: "16:00",
        about: false,
        until: "wtorku 27 października",
      },
      emergency: false,
      second: "Cała ulica Żuki.",
    },
  ]);
  // Lisie Jamy: 26 and 29 Oct, each its own line.
  assert.deepEqual(
    waterUpcoming(waterAt(LISIE_JAMY_CICHA)).map((item) => item.span.day),
    ["2026-10-26", "2026-10-29"],
  );
  assert.deepEqual(waterUpcoming(waterAt(ASNYKA)), []);
  // A night cut ends the next day; an estimate and a failure say so.
  const [night] = waterUpcoming(
    waterAt(
      ZUKI,
      only(
        cut({
          place: ZUKI_CUT,
          start: "2026-10-27 22:00:00",
          end: "2026-10-28 04:00:00",
          endEstimated: true,
          cause: "emergency",
        }),
      ),
    ),
  );
  assert.deepEqual(
    [
      night?.span.endDay,
      night?.span.about,
      night?.module === "woda" && night.emergency,
    ],
    ["2026-10-28", true, true],
  );
  // No times: the whole day, no clock.
  const [allDay] = waterUpcoming(
    waterAt(ZUKI, only(cut({ place: ZUKI_CUT, start: null, end: null }))),
  );
  assert.deepEqual(
    [allDay?.span.start, allDay?.span.end, allDay?.span.from, allDay?.span.to],
    ["2026-10-26T00:00:00+01:00", "2026-10-27T00:00:00+01:00", null, null],
  );
});

test("block's where: from the scope and our names, never the note", () => {
  const where = (address: PlaceView, posts?: StoredPost[]) =>
    whereOf(waterAt(address, posts));
  assert.equal(where(village("0606004", "Dąbków")), "Cała wieś Dąbków.");
  assert.equal(where(ZUKI), "Cała ulica Żuki.");
  // 39885's Załuże „Podłęże od numeru 44 do numeru 92”: its ranges, our
  // name (Podłęże is no TERYT place); the note is never read.
  assert.equal(where(ZALUZE), "Załuże, numery 44–92.");
  // A whole scope with a note: not „Cała”, and the note not shown.
  const noted = cut({ ...SOBIESKIEGO_RANGE, scope: { type: "whole" } });
  assert.equal(
    where(sobieskiego(), only(noted)),
    "Część ulicy – których domów dotyczy, sprawdź w szczegółach.",
  );
  // Numbers.
  const numbers = cut({
    ...SOBIESKIEGO_RANGE,
    scope: { type: "numbers", numbers: ["3", "5", "7"] },
  });
  assert.equal(
    where(sobieskiego(), only(numbers)),
    "Ulica Jana III Sobieskiego, numery 3, 5, 7.",
  );
});

test("one whole-place word from TERYT's kind, the block and the section alike", () => {
  // Wieś (Dąbków), miasto (Lubaczów), część wsi (Mazury): the kind alone.
  for (const [localityId, locality, word] of [
    ["0606004", "Dąbków", "wieś"],
    ["0972447", "Lubaczów", "miejscowość"],
    ["0972453", "Mazury", "miejscowość"],
  ]) {
    const whole = cut({
      place: { localityId, streetId: null },
      label: { locality, parent: null, street: null },
      scope: { type: "whole" },
      note: null,
    });
    const address = place({ id: localityId, localityId, streetId: null });
    assert.equal(scope(whole as Cut), `cała ${word} ${locality}`);
    assert.equal(
      whereOf(waterAt(address, only(whole))),
      `Cała ${word} ${locality}.`,
    );
  }
});

test("section: never the cuts again, the post as its source", () => {
  // The timeline lists each cut; the notices add nothing for a plain
  // one. A town street's ZUK cut: its post the only „Źródło”,
  // never MZGKiM's.
  assert.deepEqual(waterStatus(waterAt(ZUKI)), []);
  assert.deepEqual(waterSources(waterAt(ZUKI)), [
    [{ href: POST_URL, text: "komunikat gminy z 23 października 2026" }],
  ]);
  assert.equal(waterAiNote(waterAt(ZUKI)), aiNote("gminy"));
  // Its where, as written, is the subpage's.
  assert.equal(
    cutWhere(waterAt(ZALUZE).outages[0], ZALUZE),
    "Załuże: Podłęże od numeru 44 do numeru 92",
  );
  assert.deepEqual(lines(waterAt(ZALUZE)), []);
  // More days: each in the list, none in the section.
  const days = waterAt(LISIE_JAMY_CICHA);
  assert.equal(waterUpcoming(days).length, days.outages.length);
  assert.ok(days.outages.length > 1);
  assert.deepEqual(waterStatus(days), []);
  assert.deepEqual(waterSources(waterAt(LISIE_JAMY_CICHA)), [
    [{ href: POST_URL, text: "komunikat gminy z 23 października 2026" }],
  ]);
});

test("no cut here: „Brak zapowiedzianych przerw.”, the gmina's news", () => {
  const data = waterAt(SMOLINCE, []);
  assert.deepEqual(waterStatus(data), [[["Brak zapowiedzianych przerw."]]]);
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
    assert.deepEqual(waterStatus(data), [[["Brak zapowiedzianych przerw."]]]);
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
    assert.equal(data.checkedAt, CHECKED);
  }
});

test("town, an MZGKiM cut: shown as a ZUK cut, its own post the source", () => {
  const cut = [mzgkimPost(CUT_100, OCT_3_CHECKED)];
  const data = townAt(NIEMIROWSKA, cut, OCT_3, OCT_3_CHECKED);
  const [item] = waterUpcoming(data);
  assert.deepEqual(
    [item?.span.start, item?.span.end, item?.second],
    [
      "2026-10-06T08:30:00+02:00",
      "2026-10-06T15:00:00+02:00",
      "Cała ulica Niemirowska.",
    ],
  );
  assert.deepEqual(lines(data), []);
  assert.deepEqual(waterSources(data), [
    [{ href: POST_5237, text: "komunikat MZGKiM z 2 października 2026" }],
  ]);
  assert.equal(
    data.outages[0].source.name,
    "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie",
  );
  assert.equal(
    waterAiNote(data),
    "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest komunikat MZGKiM.",
  );
  // The calendar help names whose change of hours to fetch it again for:
  // the cut's source only (t370).
  const refresh = waterCalendarRefresh(data);
  assert.ok(refresh.includes(` ${MZGKIM_SOURCE.inline} `), refresh);
  assert.ok(!refresh.includes(` ${GMINA_SOURCE.inline} `), refresh);
  // Its area off our list is only linked, and not here: its cut is.
  assert.deepEqual(data.notices, []);
  // "Osiedle Mazury" (the gazetteer): each of its streets, whole.
  const estate = townAt(LESZKA_BIALEGO, cut, OCT_3, OCT_3_CHECKED);
  assert.equal(whereOf(estate), "Cała ulica Księcia Leszka Białego.");
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
  assert.deepEqual(waterStatus(data), [
    [
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
    [{ href: POST_5237, text: "komunikat MZGKiM z 2 października 2026" }],
  ]);
  // Never in a village.
  assert.deepEqual(townAt(SMOLINCE, cut, OCT_3, OCT_3_CHECKED).notices, []);
});

test("town, an MZGKiM street in part: „w części ulicy”, its words as written", () => {
  const cut = [mzgkimPost(CUT_99, JUN_1_CHECKED)];
  const data = townAt(SOBIESKIEGO_TOWN, cut, JUN_1, JUN_1_CHECKED);
  assert.equal(
    whereOf(data),
    "Część ulicy – których domów dotyczy, sprawdź w szczegółach.",
  );
  // The source's own words end the line: no full stop after them.
  assert.equal(
    cutWhere(data.outages[0], data.place),
    "ulica Jana III Sobieskiego: od siedziby Straży Pożarnej w kierunku Dąbrowy",
  );
  assert.deepEqual(waterSources(data), [
    [{ href: POST_5108, text: "komunikat MZGKiM z 1 czerwca 2026" }],
  ]);
  // Never a village's Sobieskiego, nor Dąbrowa (only a direction).
  const basznia = place({
    id: "0605890-20431",
    localityId: "0605890",
    streetId: "0605890-20431",
  });
  assert.deepEqual(townAt(basznia, cut, JUN_1, JUN_1_CHECKED).outages, []);
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
  // Both sources, in the cuts' order, either of which may change the hours.
  assert.ok(
    waterCalendarRefresh(both).includes(
      ` ${GMINA_SOURCE.inline} lub ${MZGKIM_SOURCE.inline} `,
    ),
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
  assert.equal(quiet.checkedAt, CHECKED);
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
  assert.deepEqual(waterStatus(cut).at(-1), [staleNote(cut)]);
  assert.deepEqual(waterSources(cut), [
    [{ href: POST_URL, text: "komunikat gminy z 23 października 2026" }],
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
  assert.deepEqual(waterStatus(cut).at(-1), [staleNote(cut)]);
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
    assert.equal(data.checkedAt, null);
    assert.equal(data.changedAt, null);
  }
});

test("freshness: the last read always kept, the stale note only after 1 h", () => {
  const checked = Date.parse(CHECKED);
  const at = (ms: number) =>
    waterAt(ZUKI, [post()], new Date(checked + ms), CHECKED);
  const fresh = at(STALE_MS);
  assert.equal(fresh.checkedAt, CHECKED);
  assert.equal(staleNote(fresh), null);
  assert.equal(lines(fresh).length, 0);

  const stale = at(STALE_MS + 1);
  assert.equal(stale.checkedAt, CHECKED);
  const note = staleNote(stale);
  assert.ok(note);
  assert.deepEqual(note[1], {
    href: GMINA_NEWS,
    text: "aktualności gminy Lubaczów",
  });
  // The cuts stay in the list; the section has the note.
  assert.deepEqual(waterStatus(stale), [[note]]);
  assert.equal(waterUpcoming(stale).length, 1);
  assert.match(waterNone(at(STALE_MS + 1)), /przy ostatnim sprawdzeniu/);
});

test("no file: the gmina's news only, no cut, no change time", () => {
  const data = water({}, SMOLINCE);
  assert.deepEqual(data.outages, []);
  assert.deepEqual(waterStatus(data), [
    [["Nie udało się nam sprawdzić komunikatów."]],
  ]);
  assert.deepEqual(waterUpcoming(data), []);
  assert.equal(data.checkedAt, null);
  assert.equal(data.changedAt, null);
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
  assert.deepEqual(waterStatus(data), [
    [
      [
        {
          href: POST_URL,
          text: "Gmina ogłosiła przerwę w dostawie wody, której nie umiemy dopasować do adresów – sprawdź komunikat",
          hidden: "„Przerwy w dostawie wody: 26-29.10.2026”",
        },
      ],
    ],
  ]);
  assert.deepEqual(waterUpcoming(data), []);
  // Szczutków is not in its text.
  assert.ok(!notice.localityIds.includes("0606375"));
  assert.deepEqual(
    waterAt(village("0606375", "Szczutków"), [notice]).notices,
    [],
  );
});

test("notices: a village's notice is listed on its parts", () => {
  const notice = post({
    status: "notice",
    reason: "ambiguous",
    items: [],
    localityIds: ["0606234"],
  });
  assert.equal(waterAt(SMOLINCE, [notice]).notices.length, 1);
  // Not the other way: a part's notice is not its village's.
  const partNotice = post({ ...notice, localityIds: ["0606257"] });
  assert.deepEqual(waterAt(LISIE_JAMY, [partNotice]).notices, []);
});

test("notices: never for ai-deferred, not-water or water-quality posts", () => {
  for (const reason of [AI_DEFERRED, NOT_WATER, WATER_QUALITY]) {
    const hidden = post({ status: "notice", reason, items: [] });
    const data = waterAt(ZALUZE, [hidden]);
    assert.deepEqual(data.notices, [], reason);
    assert.deepEqual(data.outages, [], reason);
    assert.deepEqual(
      waterStatus(data),
      [[["Brak zapowiedzianych przerw."]]],
      reason,
    );
  }
});

test("past cuts: gone at their end in Warsaw, not in UTC", () => {
  // ul. Żuki's cut is on Tuesday 27 Oct, 8:00-16:00; Warsaw is UTC+1.
  const at = (iso: string) => waterAt(ZUKI, [post()], new Date(iso), iso);
  assert.equal(waterUpcoming(at("2026-10-27T14:59:59Z")).length, 1);
  assert.equal(lines(at("2026-10-27T14:59:59Z")).length, 0);
  const after = at("2026-10-27T15:00:00Z");
  assert.deepEqual(after.outages, []);
  assert.deepEqual(waterUpcoming(after), []);
  assert.deepEqual(waterStatus(after), [[["Brak zapowiedzianych przerw."]]]);
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
  assert.deepEqual(
    waterUpcoming(data).map((item) => [item.span.start, item.second]),
    [["2026-10-27T08:30:00+01:00", "Cała ulica Niemirowska."]],
  );
  // Starzyny swapped for Asnyka, a street of the CI fixture.
  const asnyka = water(
    { "gmina-lubaczow": zukView(zukFile([], CHECKED), NOW), mzgkim: view },
    ASNYKA,
  );
  assert.equal(asnyka.outages.length, 1);
  assert.equal(asnyka.outages[0].label?.street, "Adama Asnyka");
  assert.equal(mockFile("5238", now), undefined);
});

// Partial cuts on village, part and /nr pages.

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
    "część wsi Lisie Jamy: ulice Długa, Wąska, Leśna i Zielona",
  );
  assert.equal(whereOf(data), "Ulice Długa, Wąska, Leśna i Zielona.");
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
        "część wsi Lisie Jamy: ulice Długa, Wąska, Leśna i Zielona",
      ],
      ["2026-10-29", "cała wieś Lisie Jamy"],
    ],
  );
  assert.equal(whereOf(data), "Ulice Długa, Wąska, Leśna i Zielona.");
  assert.deepEqual(lines(data), []);
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
    "część wsi Lisie Jamy: ulice Długa i Lwowska (od nr 26 do nr 42)",
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
    [["2026-10-28", "część wsi Młodów: ulica Pilipy"]],
  );
  assert.equal(whereOf(data), "Ulica Pilipy.");
});

test("part: its village's partial cut, the village named, a hint to check", () => {
  for (const part of [CZARNE, MOCZAR_DUZY, MOCZAR_MALY]) {
    const data = waterAt(part);
    const label = part.name;
    assert.deepEqual(
      data.outages.map((d) => d.uid),
      ["zuk-39885-2026-10-28-0606464"],
      label,
    );
    assert.equal(
      whereOf(data),
      "Część wsi Załuże – może nie obejmować tej miejscowości. Sprawdź niżej.",
      label,
    );
    assert.deepEqual(
      lines(data),
      [
        [
          `${part.name} należy do miejscowości Załuże, a komunikat dotyczy tylko jej części. Sprawdź, czy obejmuje Twój dom. Zobacz `,
          { href: "/adres/0606464", text: "stronę miejscowości Załuże" },
          ".",
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
    const data = waterAt(village(id, name));
    assert.deepEqual(
      data.outages.map((d) => d.uid),
      ["zuk-39885-2026-10-27-0606317"],
      name,
    );
    assert.equal(
      whereOf(data),
      "Część wsi Opaka – może nie obejmować tej miejscowości. Sprawdź niżej.",
    );
    assert.match(String(lines(data)[0]?.[0]), / należy do miejscowości /);
  }
});

test("part: a whole village's cut stays plain, no hint", () => {
  const data = waterAt(SMOLINCE);
  assert.equal(whereOf(data), "Cała wieś Lisie Jamy.");
  assert.ok(
    !lines(data).some((line) => String(line[0]).includes(" należy do ")),
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
