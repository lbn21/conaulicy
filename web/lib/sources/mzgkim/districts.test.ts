import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDistricts, districtSpans } from "../../districts.ts";
import { DISTRICTS } from "../../districts-seed.ts";
import {
  CICHA,
  CUT_100,
  MZGKIM_PLACES,
  MZGKIM_READINGS,
  realMzgkimPost,
  WITH_ESTATE,
} from "../../mzgkim-fixture.ts";
import { MZGKIM } from "../../water-sources.ts";
import { type PostReading, readPost, type ZukPost } from "../../zuk.ts";
import type { AiItem, AiResult } from "../../zuk-ai.ts";
import { ZUK_PLACES } from "../../zuk-places.generated.ts";
import { mzgkim } from "./index.ts";
import { systemPrompt } from "./prompt.ts";

// The gazetteer (lib/districts.ts, task 151) through MZGKiM's real posts:
// the model's readings written by hand (lib/mzgkim-fixture.ts), never a
// real call.
const CHECKED = "2026-10-26T18:00:00.000Z";
const TOWN = "0972447";
const id = (ulic: string) => `${TOWN}-${ulic}`;
const UL_MAZURY = id("12559");
const MAZURY = DISTRICTS.find((d) => d.id === "mazury");
assert.ok(MAZURY);
const ESTATE = MAZURY.streets.map((s) => s.id);

const read = (post: ZukPost, ai: AiResult) =>
  readPost(post, ai, MZGKIM_PLACES, CHECKED, {
    source: MZGKIM,
    gate: mzgkim.gate,
  });

const parsed = (reading: PostReading) => {
  assert.equal(reading.status, "parsed", JSON.stringify(reading));
  return reading as Extract<PostReading, { status: "parsed" }>;
};

const streetsOf = (r: {
  items: Array<{ place: { streetId: string | null } }>;
}) => r.items.map((d) => d.place.streetId);

/** 5237 with its "Osiedle Mazury" line written `line`, read as `items`. */
function mazuryAs(line: string, items: (base: AiItem) => AiItem[]) {
  const post = realMzgkimPost(CUT_100);
  const from = "<li>Osiedle Mazury</li>";
  assert.ok(post.content.rendered.includes(from));
  const reading = MZGKIM_READINGS[CUT_100];
  const base = reading.items[0];
  return read(
    {
      ...post,
      content: { rendered: post.content.rendered.replace(from, line) },
    },
    {
      ...reading,
      items: [
        ...reading.items.filter((i) => i.street !== "Osiedle Mazury"),
        ...items(base),
      ],
    },
  );
}

const item = (base: AiItem, street: string, verbatim: string): AiItem => ({
  ...base,
  street,
  street_verbatim: verbatim,
});

test("seed: every street id is TERYT's, of the town; Mazury exactly the 22 approved", () => {
  checkDistricts(DISTRICTS, ZUK_PLACES.streets);
  assert.throws(
    () =>
      checkDistricts(
        [{ ...MAZURY, streets: [{ ...MAZURY.streets[0], id: id("99999") }] }],
        ZUK_PLACES.streets,
      ),
    /not a street of its town: mazury: 0972447-99999/,
  );
  assert.deepEqual(
    ESTATE.map((s) => s.slice(8)),
    [
      "38139",
      "29695",
      "08179",
      "22684",
      "38140",
      "15092",
      "38137",
      "38138",
      "48939",
      "44269",
      "48377",
      "24870",
      "17390",
      "38687",
      "48412",
      "38689",
      "38690",
      "24170",
      "07290",
      "08574",
      "00157",
      "02276",
    ],
  );
  assert.equal(MAZURY.streets.filter((s) => s.confidence === "high").length, 8);
  // Not in the estate: ul. Mazury, Boczna Mazury, Podleśna, Łąkowa,
  // Ustronna, and the low ones (Jaworowa, Ostrowiecka).
  for (const ulic of [
    "12559",
    "01533",
    "16799",
    "11596",
    "23434",
    "07394",
    "15388",
  ])
    assert.equal(ESTATE.includes(id(ulic)), false, ulic);
  // Villages are never a town district; low streets never seeded.
  const names = DISTRICTS.map((d) => d.name).join(" ");
  assert.doesNotMatch(names, /Załuże|Bałaje/);
  const all = DISTRICTS.flatMap((d) => d.streets.map((s) => s.id));
  for (const ulic of ["15710", "13252", "25084", "16894", "48934", "17011"])
    assert.equal(all.includes(id(ulic)), false, ulic);
  assert.ok(DISTRICTS.every((d) => d.localityId === TOWN));
});

test("seed: the addendum's districts, their streets and stretches", () => {
  const streets = (key: string) =>
    DISTRICTS.find((d) => d.id === key)?.streets.map((s) =>
      s.part ? `${s.id.slice(8)} ${s.part}` : s.id.slice(8),
    );
  assert.deepEqual(streets("mazury-vi"), ["38687", "48412"]);
  assert.deepEqual(streets("piaski"), [
    "16027",
    "16033",
    "18819",
    "24550",
    "26081",
    "14834",
  ]);
  assert.deepEqual(streets("maly-lazek"), ["12206"]);
  assert.deepEqual(streets("jagiellonow"), ["45843"]);
  assert.deepEqual(streets("mickiewicza"), ["48372"]);
  assert.deepEqual(streets("unii-lubelskiej"), ["48373", "23367"]);
  assert.deepEqual(streets("orzeszkowej"), ["15211"]);
  assert.deepEqual(streets("norwida"), ["14319"]);
  assert.deepEqual(streets("slowackiego"), ["20291 bloki 24–34A"]);
  assert.deepEqual(streets("zelichowka"), ["26445"]);
  assert.deepEqual(streets("pod-borem"), ["16590"]);
  assert.deepEqual(streets("zuki"), ["26555"]);
  for (const key of [
    "niwki",
    "ostrowiec",
    "zaprzekop",
    "jana-pawla-ii",
    "folwarki",
    "przy-przemyslowej",
    "za-koleja",
    "za-niemirowska",
  ])
    assert.deepEqual(streets(key), [], key);
});

test("4744: Cicha before 'ul. Młodowska' is kept, whole (the dry run lost it)", () => {
  const r = parsed(read(realMzgkimPost(CICHA), MZGKIM_READINGS[CICHA]));
  const cicha = r.items.find((d) => d.place.streetId === id("02974"));
  assert.ok(cicha, JSON.stringify(r.dropped));
  assert.deepEqual(cicha.scope, { type: "whole" });
  assert.equal(cicha.date, "2025-05-14");
  assert.equal(cicha.end, "2025-05-14 12:00:00");
  // Every street of the list, Kościuszki in part; Żelichówka (also an
  // estate, of that one street) is the street, with no doubt.
  for (const ulic of ["09582", "13563", "06341", "26445", "23527", "02974"])
    assert.ok(streetsOf(r).includes(id(ulic)), ulic);
  assert.deepEqual(
    r.items.find((d) => d.place.streetId === id("09582"))?.scope,
    { type: "unknown" },
  );
  // "ul. Młodowska (Młodów)": the bracket names the village Młodów, so the
  // gate leaves it out, never widens it.
  assert.equal(streetsOf(r).includes(id("13080")), false);
  assert.deepEqual(r.dropped, [
    "item 7: proximity: deciding mention Młodów (bracket)",
  ]);
  // Left out, its words linked on the town's pages.
  assert.deepEqual(r.unmatched, ["ul. Młodowska"]);
});

test("4799: 'Mazury wraz z osiedlem' is ul. Mazury whole and the estate's 22 streets", () => {
  const r = parsed(
    read(realMzgkimPost(WITH_ESTATE), MZGKIM_READINGS[WITH_ESTATE]),
  );
  const mazury = r.items.find((d) => d.place.streetId === UL_MAZURY);
  assert.ok(mazury);
  assert.deepEqual(mazury.scope, { type: "whole" });
  assert.equal(mazury.note, null);
  for (const s of ESTATE) {
    const d = r.items.find((x) => x.place.streetId === s);
    assert.ok(d, s);
    assert.deepEqual(d.scope, { type: "whole" });
    assert.equal(d.where, "Mazury wraz z osiedlem");
  }
  // "Niemirowska wraz z osiedlem": the street whole, the estate (no
  // streets known) linked as written; ul. Mazury is not in doubt here.
  assert.deepEqual(
    r.items.find((d) => d.place.streetId === id("14183"))?.scope,
    { type: "whole" },
  );
  assert.deepEqual(r.unmatched, ["Niemirowska wraz z osiedlem"]);
  assert.equal(r.items[0].date, "2025-07-08");
  assert.equal(r.items[0].start, "2025-07-08 09:00:00");
  assert.equal(r.items[0].end, "2025-07-08 12:00:00");
  for (const ulic of ["20431", "39849", "20598"])
    assert.ok(streetsOf(r).includes(id(ulic)), ulic);
});

test("4799 as the dry run read it: 'wraz z osiedlem' as a note never makes it partial", () => {
  // The model's mistake on Jakub's box: the street with the phrase as its
  // note, no estate item.
  const wrong = {
    ...MZGKIM_READINGS[WITH_ESTATE],
    items: MZGKIM_READINGS[WITH_ESTATE].items
      .filter((i) => !i.street_verbatim?.includes("wraz z"))
      .map((i) =>
        i.street === "Mazury" || i.street === "Niemirowska"
          ? { ...i, note: "wraz z osiedlem" }
          : i,
      ),
  };
  const r = parsed(read(realMzgkimPost(WITH_ESTATE), wrong));
  for (const s of [UL_MAZURY, id("14183"), ...ESTATE]) {
    const d = r.items.find((x) => x.place.streetId === s);
    assert.ok(d, s);
    assert.deepEqual(d.scope, { type: "whole" }, s);
    assert.equal(d.note, null);
  }
  assert.deepEqual(r.unmatched, ["Niemirowska wraz z osiedlem"]);
  // The prompt says so too.
  assert.match(
    systemPrompt(MZGKIM_PLACES),
    /"wraz z …" is never a limitation of X\. The street X is WHOLE/,
  );
});

test("'ul. Mazury' is the street only; 'ul. Mazury, osiedle Mazury' both", () => {
  const street = parsed(
    mazuryAs("<li>ul. Mazury</li>", (b) => [item(b, "Mazury", "ul. Mazury")]),
  );
  assert.ok(streetsOf(street).includes(UL_MAZURY));
  assert.equal(
    streetsOf(street).some((s) => ESTATE.includes(s as string)),
    false,
  );
  assert.equal(street.unmatched?.includes("ul. Mazury"), false);
  const both = parsed(
    mazuryAs("<li>ul. Mazury, osiedle Mazury</li>", (b) => [
      item(b, "Mazury", "ul. Mazury"),
      item(b, "Osiedle Mazury", "osiedle Mazury"),
    ]),
  );
  assert.deepEqual(
    streetsOf(both).filter(
      (s) => s === UL_MAZURY || ESTATE.includes(s as string),
    ).length,
    23,
  );
  assert.deepEqual(both.unmatched, [
    "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej",
  ]);
});

test("a bare 'Mazury': the street, its words linked as a doubt", () => {
  // As a street, or as the district the model took it for: the same.
  for (const reading of [
    (b: AiItem) => [item(b, "Mazury", "Mazury")],
    (b: AiItem) => [item(b, "Osiedle Mazury", "Mazury")],
    (b: AiItem) => [
      {
        ...b,
        locality: "Mazury",
        locality_verbatim: "Mazury",
        street: null,
        street_verbatim: null,
      },
    ],
  ]) {
    const r = parsed(mazuryAs("<li>Mazury</li>", reading));
    assert.ok(streetsOf(r).includes(UL_MAZURY));
    assert.equal(
      streetsOf(r).some((s) => ESTATE.includes(s as string)),
      false,
    );
    assert.deepEqual(r.unmatched, [
      "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej",
      "Mazury",
    ]);
  }
  // "Boczna Mazury" is its own street, never the bare name.
  const boczna = parsed(
    mazuryAs("<li>Boczna Mazury</li>", (b) => [
      item(b, "Boczna Mazury", "Boczna Mazury"),
    ]),
  );
  assert.ok(streetsOf(boczna).includes(id("01533")));
  assert.equal(streetsOf(boczna).includes(UL_MAZURY), false);
  assert.equal(boczna.unmatched?.includes("Boczna Mazury"), false);
});

test("Piaski: 'ul. Piaski' the street, bare a doubt, 'osiedle Piaski' its six streets", () => {
  const PIASKI = id("16027");
  const ul = parsed(
    mazuryAs("<li>ul. Piaski</li>", (b) => [item(b, "Piaski", "ul. Piaski")]),
  );
  assert.ok(streetsOf(ul).includes(PIASKI));
  assert.equal(ul.unmatched?.includes("ul. Piaski"), false);
  const bare = parsed(
    mazuryAs("<li>Piaski</li>", (b) => [item(b, "Piaski", "Piaski")]),
  );
  assert.ok(streetsOf(bare).includes(PIASKI));
  assert.ok(bare.unmatched?.includes("Piaski"));
  const estate = parsed(
    mazuryAs("<li>osiedle Piaski</li>", (b) => [
      item(b, "Osiedle Piaski", "osiedle Piaski"),
    ]),
  );
  for (const ulic of ["16027", "16033", "18819", "24550", "26081", "14834"])
    assert.ok(streetsOf(estate).includes(id(ulic)), ulic);
  // Never the part Piaski of Basznia Dolna.
  assert.equal(
    estate.items.some((d) => d.place.localityId === "0605915"),
    false,
  );
});

test("inflected and other districts: 'na osiedlu Mazury VI', a stretch, two streets", () => {
  const vi = parsed(
    mazuryAs("<li>na osiedlu Mazury VI</li>", (b) => [
      item(b, "Osiedle Mazury VI", "osiedlu Mazury VI"),
    ]),
  );
  assert.deepEqual(
    vi.items.slice(3).map((d) => d.place.streetId),
    [id("38687"), id("48412")],
  );
  // Never all of Osiedle Mazury: "os. Mazury" inside "os. Mazury VI" is
  // not that name.
  assert.deepEqual(
    districtSpans("na os. Mazury VI", DISTRICTS).map((s) => s.district.id),
    ["mazury-vi"],
  );
  const blocks = parsed(
    mazuryAs("<li>os. Słowackiego</li>", (b) => [
      item(b, "Osiedle Słowackiego", "os. Słowackiego"),
    ]),
  );
  const slowackiego = blocks.items.find(
    (d) => d.place.streetId === id("20291"),
  );
  assert.deepEqual(slowackiego?.scope, { type: "unknown" });
  assert.equal(slowackiego?.note, "bloki 24–34A");
  const unii = parsed(
    mazuryAs("<li>osiedla Unii Lubelskiej</li>", (b) => [
      item(b, "Osiedle Unii Lubelskiej", "osiedla Unii Lubelskiej"),
    ]),
  );
  assert.deepEqual(
    unii.items.slice(3).map((d) => d.place.streetId),
    [id("48373"), id("23367")],
  );
  // A limit on the whole estate: its streets are not read, its words linked.
  const limited = parsed(
    mazuryAs("<li>Osiedle Mazury od nr 1 do nr 9</li>", (b) => [
      {
        ...item(b, "Osiedle Mazury", "Osiedle Mazury"),
        note: "od nr 1 do nr 9",
      },
    ]),
  );
  assert.equal(limited.items.length, 3);
  assert.ok(limited.unmatched?.includes("Osiedle Mazury"));
});

test("a street the post names gives way to the estate's: never twice, never wider", () => {
  // "osiedle Mazury, ul. Zibura od nr 1 do nr 9": Zibura in part, once.
  const r = parsed(
    mazuryAs(
      "<li>osiedle Mazury</li><li>ul. Zibura od nr 1 do nr 9</li>",
      (b) => [
        item(b, "Osiedle Mazury", "osiedle Mazury"),
        {
          ...item(b, "Mikołaja Zibura", "ul. Zibura"),
          note: "od nr 1 do nr 9",
        },
      ],
    ),
  );
  const zibura = r.items.filter((d) => d.place.streetId === id("38137"));
  assert.equal(zibura.length, 1);
  assert.deepEqual(zibura[0].scope, {
    type: "ranges",
    ranges: [{ from: "1", to: "9" }],
  });
  assert.equal(r.items.length, 3 + 22);
});

test("prompt: the gazetteer in the context, names, forms and streets", () => {
  const prompt = systemPrompt(MZGKIM_PLACES);
  const context = prompt.slice(prompt.indexOf("Context:"));
  assert.match(
    context,
    /\nDistricts of Lubaczów \(osiedla: informal names TERYT does not have\), each with the forms it is written in and its streets:\n/,
  );
  assert.match(
    context,
    /\n- Osiedle Mazury; forms: os\. Mazury, osiedla Mazury, osiedlu Mazury, [^\n]*; streets: Agenora Gołuchowskiego, Akacjowa, [^\n]*, św\. Królowej Jadwigi\n/,
  );
  assert.match(context, /\n- Niwki; forms: Niwkach; no streets\n/);
  assert.match(context, /Juliusza Słowackiego \(bloki 24–34A\)/);
  // Without a gazetteer, the context as before.
  assert.doesNotMatch(systemPrompt(ZUK_PLACES), /Districts of/);
  assert.equal(prompt, systemPrompt(MZGKIM_PLACES));
});
