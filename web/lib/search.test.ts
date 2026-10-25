import assert from "node:assert/strict";
import { test } from "node:test";
import { withHouseNumber } from "./house.ts";
import { normalize } from "./normalize.ts";
import {
  exactPlace,
  matcher,
  placeHref,
  type SearchIndex,
  searchTerms,
} from "./search.ts";
import { PLACES } from "./search-fixture.ts";

const match = matcher(PLACES);
const labels = (q: string) => match(q).hits.map((hit) => hit.label);

// Tuning battery: query → expected top label substring (from the prototype).
const battery: Array<[string, string]> = [
  ["rynek", "ul. Rynek, Lubaczów"],
  ["  RYNEK  ", "ul. Rynek, Lubaczów"],
  ["ul Rynek", "ul. Rynek, Lubaczów"],
  ["ulica rynek", "ul. Rynek, Lubaczów"],
  ["Rynk", "ul. Rynek, Lubaczów"],
  ["Ryenk", "ul. Rynek, Lubaczów"],
  ["Rynku", "ul. Rynek, Lubaczów"],
  ["ynek", "ul. Rynek, Lubaczów"],
  ["Lubaczów Rynek", "ul. Rynek, Lubaczów"],
  ["lubaczow rynek", "ul. Rynek, Lubaczów"],
  ["Rynek 5", "ul. Rynek, Lubaczów"],
  ["Rynek 5a", "ul. Rynek, Lubaczów"],
  ["Rynek 5/2", "ul. Rynek, Lubaczów"],
  ["ul. Rynek 5, Lubaczów", "ul. Rynek, Lubaczów"],
  ["ul. Rynek, Lubaczów 5", "ul. Rynek, Lubaczów"],
  ["rynek 37-600", "ul. Rynek, Lubaczów"],
  ["lakowa", "ul. Łąkowa, Lubaczów"],
  ["lakowa mlodow", "ul. Łąkowa, Młodów"],
  ["szkolna mlodow", "ul. Szkolna, Młodów"],
  ["zkoln", "ul. Szkolna"],
  ["Asnyka", "ul. Adama Asnyka, Lubaczów"],
  ["Asnika", "ul. Adama Asnyka, Lubaczów"],
  ["snyk", "ul. Adama Asnyka, Lubaczów"],
  ["Adama Asnyka", "ul. Adama Asnyka, Lubaczów"],
  ["Asnyka Adama", "ul. Adama Asnyka, Lubaczów"],
  ["Asnyka 12", "ul. Adama Asnyka, Lubaczów"],
  ["ul. Adama Asnyka 12, Lubaczów", "ul. Adama Asnyka, Lubaczów"],
  ["Mickiewicza", "ul. Adama Mickiewicza, Lubaczów"],
  ["Mickiewicz", "ul. Adama Mickiewicza, Lubaczów"],
  ["Mickewicza", "ul. Adama Mickiewicza, Lubaczów"],
  ["ckiewi", "Mickiewicza"],
  ["os. Mickiewicza", "Osiedle Mickiewicza, Lubaczów"],
  ["osiedle mickiewicza", "Osiedle Mickiewicza, Lubaczów"],
  ["ul. Mickiewicza", "ul. Adama Mickiewicza, Lubaczów"],
  ["al. Jaworskiego", "aleja kardynała Mariana Jaworskiego"],
  ["Jaworskiego Lubaczów", "aleja kardynała Mariana Jaworskiego, Lubaczów"],
  ["3 Maja", "ul. 3-go Maja, Lubaczów"],
  ["3-go Maja", "ul. 3-go Maja, Lubaczów"],
  ["Trzeciego Maja", "ul. 3-go Maja, Lubaczów"],
  ["Maja 3", "ul. 3-go Maja, Lubaczów"],
  ["3 maja 10", "ul. 3-go Maja, Lubaczów"],
  ["Grunwald", "ul. Grunwaldzka, Lubaczów"],
  ["Grunwaldzka", "ul. Grunwaldzka, Lubaczów"],
  ["Grundwaldzka", "ul. Grunwaldzka, Lubaczów"],
  ["Piłsudzkiego", "ul. Józefa Piłsudskiego, Lubaczów"],
  ["chopina", "ul. Fryderyka Szopena, Lubaczów"],
  ["Kosciuszki mlodow", "ul. Tadeusza Kościuszki, Młodów"],
  ["zwirki i wigury", "ul. Żwirki i Wigury, Lubaczów"],
  ["sw anny", "ul. Św. Anny, Lubaczów"],
  ["swietej anny", "ul. Św. Anny, Lubaczów"],
  ["gen hallera", "ul. gen. Hallera, Lubaczów"],
  ["Lubasy", "Lubasy (Basznia Dolna, gm. Lubaczów)"],
  ["Lubasy (Basznia Dolna, gm. Lubaczów)", "Lubasy (Basznia Dolna"],
  ["Basznia Górna", "Basznia Górna (gm. Lubaczów)"],
  ["Baszni", "Basznia"],
  ["Krowica Sama", "Krowica Sama"],
  ["dabrowa", "Dąbrowa (gm. Lubaczów)"],
  ["Wolka", "Wólka Krowicka (gm. Lubaczów)"],
  ["Opaka", "Opaka (gm. Lubaczów)"],
  ["Dolna", "Dolna"],
  ["lesna lisie jamy", "ul. Leśna, Lisie Jamy"],
  ["Huta", "Huta Kryształowa"],
];

// Held-out battery, written before any tuning; never special-cased.
const heldOut: Array<[string, string]> = [
  ["kopernika", "ul. Mikołaja Kopernika, Lubaczów"],
  ["Kopernik", "ul. Mikołaja Kopernika, Lubaczów"],
  ["Sienkiewcza", "ul. Henryka Sienkiewicza, Lubaczów"],
  ["slowackiego 7", "ul. Juliusza Słowackiego, Lubaczów"],
  ["zeromskiego", "ul. Stefana Żeromskiego, Lubaczów"],
  ["Konopnicka", "ul. Marii Konopnickiej, Lubaczów"],
  ["Wyszynskiego", "ul. Kard. Stefana Wyszyńskiego, Lubaczów"],
  ["kard wyszynskiego", "ul. Kard. Stefana Wyszyńskiego, Lubaczów"],
  ["jagielly", "ul. Władysława Jagiełły, Lubaczów"],
  ["pileckiego", "ul. rtm. Witolda Pileckiego, Lubaczów"],
  ["Sobieskiego Basznia", "ul. Jana III Sobieskiego, Basznia Dolna"],
  ["sobieskiego karolowka", "ul. Jana III Sobieskiego, Karolówka"],
  ["Wojska Polskiego 15", "ul. Wojska Polskiego, Lubaczów"],
  ["37-600 Lubaczów, ul. Kolejowa 3", "ul. Kolejowa, Lubaczów"],
  ["kolejowa basznia", "ul. Kolejowa, Basznia Dolna"],
  ["Kolejowa", "ul. Kolejowa, Lubaczów"],
  ["Szczutkow", "Szczutków (gm. Lubaczów)"],
  ["Zaluze", "Załuże (gm. Lubaczów)"],
  ["Budomiez", "Budomierz (gm. Lubaczów)"],
  ["Krowica Holodowska", "Krowica Hołodowska (gm. Lubaczów)"],
  ["Huta Krysztalowa", "Huta Kryształowa (gm. Lubaczów)"],
  ["mokrzyc", "Mokrzyca (gm. Lubaczów)"],
  ["szymanskiego", "ul. Dr Henryka M. Szymańskiego, Lubaczów"],
  ["Hubala", "ul. Mjr. Hubala, Lubaczów"],
  ["monte casino", "ul. Monte Cassino, Lubaczów"],
  ["westerplate", "ul. Westerplatte, Lubaczów"],
  ["os jagiellonow", "Osiedle Jagiellonów, Lubaczów"],
  ["sw floriana", "ul. św. Floriana, Młodów"],
  ["Krolowej Jadwigi", "ul. św. Królowej Jadwigi, Lubaczów"],
  ["ul. Piłsudskiego 4/12", "ul. Józefa Piłsudskiego, Lubaczów"],
];
const junk = ["xyzqq", "qwer", "zzzz"];

// Pass: the top place's label contains the expected text (compared as
// search compares). Every failure is printed.
function passRate(name: string, cases: Array<[string, string]>): number {
  const failures = cases.flatMap(([q, expected]) => {
    const [top = "(none)"] = labels(q);
    return normalize(top).includes(normalize(expected))
      ? []
      : [`${JSON.stringify(q)} → ${top}, expected ${expected}`];
  });
  const rate = (cases.length - failures.length) / cases.length;
  console.log(
    `${name}: ${cases.length - failures.length}/${cases.length} (${(rate * 100).toFixed(1)} %)${failures.map((f) => `\n  FAIL ${f}`).join("")}`,
  );
  return rate;
}

test("tuning battery: at least 95 %", () => {
  assert.ok(passRate("tuning", battery) >= 0.95);
});

test("held-out battery: at least 85 %", () => {
  assert.ok(passRate("held-out", heldOut) >= 0.85);
});

test("junk finds nothing", () => {
  for (const q of junk) assert.deepEqual(labels(q), [], q);
});

test("a single letter only starts a word, never a typo", () => {
  const found = labels("k");
  assert.equal(found.length, 8);
  for (const label of found) {
    assert.ok(
      normalize(label)
        .split(" ")
        .some((word) => word.startsWith("k")),
      label,
    );
  }
});

test("at most 8 suggestions; every one when asked", () => {
  assert.equal(labels("lubaczow").length, 8);
  assert.equal(
    match("lubaczow", Number.POSITIVE_INFINITY).hits.length,
    PLACES.filter(([, label]) => label.includes("Lubaczów")).length,
  );
});

test("ul. and ulica alone leave nothing to search for", () => {
  for (const q of ["ul", "ul.", " Ulica ", "ul. ulica", "37-600"]) {
    assert.deepEqual(searchTerms(q), [], q);
    assert.deepEqual(labels(q), [], q);
  }
  assert.deepEqual(searchTerms("ul. Słowackiego"), ["slowackiego"]);
});

test("a house number rides along, wherever it stands", () => {
  const nr = (q: string) => match(q).hits[0]?.nr ?? null;
  assert.equal(nr("Asnyka 12"), "12");
  assert.equal(nr("12A asnyka"), "12a");
  assert.equal(nr("ul. Słowackiego 7/22"), "7/22");
  assert.equal(nr("ul. Rynek 5, Lubaczów"), "5");
  assert.equal(nr("ul. Rynek, Lubaczów 5"), "5");
  assert.equal(nr("37-600 Lubaczów, ul. Kolejowa 3"), "3");
  // "3" is part of "3-go Maja".
  assert.equal(nr("3 Maja"), null);
  assert.equal(nr("3 maja 10"), "10");
  assert.equal(nr("Asnyka"), null);
  assert.deepEqual(labels("ul 12"), []);
  assert.equal(
    placeHref({ id: "s1", label: "", nr: "7/22" }),
    "/adres/s1?nr=7/22",
  );
  assert.equal(placeHref({ id: "s1", label: "" }), "/adres/s1");
});

test("clear only when the first place matches better than the rest", () => {
  assert.equal(match("rynek").clear, true);
  assert.equal(match("Asnyka 12").clear, true);
  assert.equal(match("os. Mickiewicza").clear, true);
  assert.equal(match("ul. Mickiewicza").clear, true);
  assert.equal(match("Mickiewicza").clear, false);
  assert.equal(match("Kolejowa").clear, false);
  assert.equal(match("Opaka").clear, false);
  assert.equal(match("adama").clear, false);
});

// /szukaj opens one place only when clear (task 95): never for "a" (once
// ul. Hetmana A. M. Sieniawskiego, on its initial) or "as".
test("clear needs 3+ letters; an initial alone never wins", () => {
  const top = (q: string) => match(q).hits[0]?.label;
  for (const q of ["a", "A.", "a 12", "as"]) {
    assert.equal(match(q).clear, false, q);
  }
  assert.notEqual(top("a"), "ul. Hetmana A. M. Sieniawskiego, Lubaczów");
  assert.ok(match("a").hits.length > 1);
  assert.equal(match("asn").clear, true);
  assert.equal(top("asn"), "ul. Adama Asnyka, Lubaczów");
  assert.equal(match("3 maja").clear, true);
  assert.equal(top("3 maja"), "ul. 3-go Maja, Lubaczów");
  assert.equal(match("mickewicza").clear, false);
  assert.equal(top("mickewicza"), "ul. Adama Mickiewicza, Lubaczów");
  assert.equal(match("basnia").clear, false);
  assert.ok(match("basnia").hits.length > 1);
  // A whole initial still narrows a longer query.
  assert.equal(
    top("a sieniawskiego"),
    "ul. Hetmana A. M. Sieniawskiego, Lubaczów",
  );
});

test("under 5 ms per query on the 330 places", () => {
  const queries = [...battery, ...heldOut].map(([q]) => q).concat(junk);
  const fresh = matcher(PLACES);
  const start = performance.now();
  for (const q of queries) fresh(q);
  const each = (performance.now() - start) / queries.length;
  console.log(`search: ${each.toFixed(2)} ms per query (${queries.length})`);
  assert.ok(each < 5, `${each} ms`);
});

test("every suggestion's text opens its own place", () => {
  for (const [id, label] of PLACES) {
    assert.deepEqual(exactPlace(PLACES, label), { id, label }, label);
    for (const nr of ["12", "7a", "7/22"]) {
      // Where the field puts it, or typed after a picked suggestion.
      for (const text of [withHouseNumber(label, nr), `${label} ${nr}`]) {
        assert.deepEqual(exactPlace(PLACES, text), { id, label, nr }, text);
      }
    }
  }
});

test("the text as search compares it: case, Polish letters, spaces", () => {
  assert.deepEqual(
    exactPlace(PLACES, "  BASZNIA  (basznia dolna gm lubaczow"),
    { id: "p005", label: "Basznia (Basznia Dolna, gm. Lubaczów)" },
  );
  for (const q of [
    "ul. Adama Asnyka, Lubaczów 12",
    "ul. Adama Asnyka 12, Lubaczów",
  ]) {
    assert.deepEqual(exactPlace(PLACES, q), {
      id: "p062",
      label: "ul. Adama Asnyka, Lubaczów",
      nr: "12",
    });
  }
  assert.deepEqual(exactPlace(PLACES, "ul. Adama Asnyka 12A, Lubaczów"), {
    id: "p062",
    label: "ul. Adama Asnyka, Lubaczów",
    nr: "12a",
  });
});

test("anything else is left to the search proper", () => {
  for (const q of [
    "Basznia",
    "Asnyka",
    "Asnyka 12",
    "12 ul. Adama Asnyka, Lubaczów",
    "ul. Adama Asnyka 12 14, Lubaczów",
  ]) {
    assert.equal(exactPlace(PLACES, q), null, q);
  }
  const twice: SearchIndex = [
    ["a", "Wola (gm. Lubaczów)", "wies"],
    ["b", "Wola (gm. Lubaczów)", "wies"],
  ];
  assert.equal(exactPlace(twice, "Wola (gm. Lubaczów)"), null);
});

test("a bare name means a street: anything else yields on a tie", () => {
  for (const q of ["Mickiewicza", "Mickewicza"]) {
    const { hits, clear } = match(q);
    assert.deepEqual(
      hits.slice(0, 2).map((hit) => hit.label),
      ["ul. Adama Mickiewicza, Lubaczów", "Osiedle Mickiewicza, Lubaczów"],
      q,
    );
    assert.equal(clear, false, q);
  }
  for (const q of ["os. Mickiewicza", "osiedle mickiewicza"]) {
    const { hits, clear } = match(q);
    assert.equal(hits[0].label, "Osiedle Mickiewicza, Lubaczów", q);
    assert.equal(clear, true, q);
  }
  assert.equal(labels("Unii Lubelskiej")[0], "ul. Unii Lubelskiej, Lubaczów");
  assert.equal(
    labels("al. Jaworskiego")[0].startsWith("aleja kardynała Mariana"),
    true,
  );
});

test("a village before an osiedle in it: size by town or village", () => {
  // Krowica Sama has a street, and is a place of its own all the same.
  assert.equal(labels("Sama")[0], "Krowica Sama (gm. Lubaczów)");
  const village: SearchIndex = [
    ["v", "Krowica Sama (gm. Lubaczów)", "wies"],
    ["o", "Osiedle Wolności, Krowica Sama", "os."],
    ["p", "Blusy (Krowica Sama, gm. Lubaczów)", "czesc_wsi"],
  ];
  assert.deepEqual(
    matcher(village)("Sama").hits.map((hit) => hit.id),
    ["v", "o", "p"],
  );
});

test("a CECHA abbreviation and its word match each other", () => {
  const squares: SearchIndex = [
    ["a", "pl. Wolności, Lubaczów", "pl."],
    ["b", "ul. Wolności, Lubaczów", "ul."],
  ];
  const find = matcher(squares);
  for (const q of ["plac Wolności", "pl. Wolności", "pl Wolnosci"]) {
    assert.deepEqual(
      find(q).hits.map((hit) => hit.id),
      ["a"],
      q,
    );
  }
  // Bare, the street first; the square still listed.
  assert.deepEqual(
    find("Wolności").hits.map((hit) => hit.id),
    ["b", "a"],
  );
});
