// Adversarial readings: what a model could get wrong about places, through
// the whole pipeline (the gate, then the repo's checks), in the v3.1 item
// shape (task 114b). A wrong place must never
// come out; dropping one is fine. P1-P4, P7, P11, P14 and P15 are the A/B
// test's probes (25 Oct 2026, task 112); P5, P6, P8-P10, P12, P13 and P16
// were added with them, as that test's list gave only the ones above; P17
// and P18 with the street check.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readPost, type ZukPost } from "./zuk.ts";
import type { AiItem } from "./zuk-ai.ts";
import { PLACES } from "./zuk-fixture.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

const CHECKED = "2026-11-02T08:00:00Z";

function post(places: string): ZukPost {
  return {
    id: 1,
    date: "2026-11-02T10:00:00",
    modified: "2026-11-02T10:00:00",
    link: "https://www.gminalubaczow.pl/2026/11/02/przerwa/",
    title: { rendered: "Przerwa w dostawie wody – 5.11.2026" },
    content: {
      rendered: `<p>Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w dniu 5.11.2026 (czwartek) w godz. od 9:00 do 14:00 nastąpi przerwa w dostawie wody w miejscowościach: ${places}.</p>`,
    },
  };
}

const item = (
  locality: string,
  locality_verbatim: string,
  street: string | null = null,
  street_verbatim: string | null = null,
  note: string | null = null,
): AiItem => ({
  date: "2026-11-05",
  start: "09:00",
  end: "14:00",
  locality,
  locality_verbatim,
  street,
  street_verbatim,
  note,
  kind: "planned",
});

/** The place ids that come out, or the reason nothing did. */
function read(text: string, items: AiItem[], places: ZukPlaces = PLACES) {
  const r = readPost(
    post(text),
    { post_type: "water_outage", quality_status: null, is_past: false, items },
    places,
    CHECKED,
  );
  return r.status === "parsed"
    ? r.items.map((d) => d.place.streetId ?? d.place.localityId)
    : r.reason;
}

const dropped = (result: string[] | string, why: RegExp, probe: string) => {
  assert.equal(typeof result, "string", `${probe}: ${result}`);
  assert.match(result as string, /^no place: item 1: /, probe);
  assert.match(result as string, why, probe);
};

test("P1-P3: a name read short, inside a longer one of ours, is dropped", () => {
  for (const [probe, short, long] of [
    ["P1", "Basznia", "Basznia Dolna"],
    ["P2", "Cetynia", "Cetynia Hołodowska"],
    ["P3", "Ruda", "Ruda Szczutkowska"],
  ])
    dropped(
      read(long, [item(short, short)]),
      /locality_verbatim only inside a longer place name/,
      probe,
    );
});

test("P4: 'przysiółek Dąbrowa' without Basznia Górna is dropped", () => {
  dropped(
    read("Opaka, przysiółek Dąbrowa", [item("Dąbrowa", "Dąbrowa")]),
    /"przysiółek Dąbrowa" without its village/,
    "P4",
  );
});

test("P5: bare Mielniki, two village parts, is dropped", () => {
  dropped(
    read("Mielniki", [item("Mielniki", "Mielniki")]),
    /locality 'Mielniki' not ours\/ambiguous/,
    "P5",
  );
});

test("P6: 'Lubaczów ul. Żuki' read as the village part Żuki is dropped", () => {
  dropped(
    read("Lubaczów ul. Żuki", [item("Żuki", "Żuki")]),
    /"Żuki" named only as a street/,
    "P6",
  );
});

test("P7: 'Szczutków (Mielniki)' is Szczutków's Mielniki", () => {
  assert.deepEqual(
    read("Szczutków (Mielniki)", [item("Mielniki (Szczutków)", "Mielniki")]),
    ["0606381"],
  );
});

test("P8: an unlisted name alone, given a village, is dropped", () => {
  dropped(
    read("Podłęże", [item("Załuże", "Podłęże", null, null, "Podłęże")]),
    /locality_verbatim does not match locality/,
    "P8",
  );
});

test("P9: an unlisted name as the locality is dropped", () => {
  dropped(
    read("Załuże–Podłęże", [item("Podłęże", "Podłęże")]),
    /locality 'Podłęże' not ours\/ambiguous/,
    "P9",
  );
});

test("P10: a place the text does not have is dropped", () => {
  dropped(
    read("Dąbków", [item("Opaka", "Opaka")]),
    /locality_verbatim not literal/,
    "P10",
  );
});

test("P11: 'ul. 3 Maja' for our '3-go Maja' is dropped, not matched", () => {
  const places: ZukPlaces = {
    ...PLACES,
    streets: [
      ...PLACES.streets,
      {
        id: "0972447-00001",
        localityId: "0972447",
        name: "3-go Maja",
        cecha: "ul.",
        name1: "3-go Maja",
      },
    ],
  };
  dropped(
    read(
      "Lubaczów, ul. 3 Maja",
      [item("Lubaczów", "Lubaczów", "3 Maja", "ul. 3 Maja")],
      places,
    ),
    /street '3 Maja' matches 0 in Lubaczów/,
    "P11",
  );
});

test("P12: another locality's street is never borrowed", () => {
  // Lwowska is a street of Lisie Jamy, not of Młodów.
  dropped(
    read("Młodów, ul. Lwowska", [
      item("Młodów", "Młodów", "Lwowska", "ul. Lwowska"),
    ]),
    /street 'Lwowska' matches 0 in Młodów/,
    "P12",
  );
});

test("P13: 'Dąbrowa i Krowica Lasowa' is the village Dąbrowa and Krowica Lasowa", () => {
  assert.deepEqual(
    read("Dąbrowa i Krowica Lasowa", [
      item("Dąbrowa", "Dąbrowa"),
      item("Krowica Lasowa", "Krowica Lasowa"),
    ]),
    ["0606010", "0606168"],
  );
});

test("P14: 'Zaluze' is Załuże: only case and diacritics may differ", () => {
  // gate-spec check 4 (v3.1): the written name is the locality's, case
  // and diacritics aside; the old guard dropped it.
  assert.deepEqual(read("Zaluze", [item("Załuże", "Zaluze")]), ["0606464"]);
  dropped(
    read("Załużu", [item("Załuże", "Załużu")]),
    /locality_verbatim does not match locality/,
    "P14",
  );
});

test("P15: 'Basznia Dolna, ul. Leśna' read as Basznia is dropped", () => {
  dropped(
    read("Basznia Dolna, ul. Leśna", [
      item("Basznia", "Basznia", "Leśna", "ul. Leśna"),
    ]),
    /locality_verbatim only inside a longer place name/,
    "P15",
  );
});

test("P16: one bad place drops only that place", () => {
  assert.deepEqual(
    read("Basznia Dolna, Opaka", [
      item("Basznia", "Basznia"),
      item("Opaka", "Opaka"),
    ]),
    ["0606317"],
  );
});

test("P17: 'ul. Podleśna' read as our street Leśna is dropped", () => {
  dropped(
    read("Lisie Jamy, ul. Podleśna", [
      item("Lisie Jamy", "Lisie Jamy", "Leśna", "ul. Podleśna"),
    ]),
    /street_verbatim lacks street name/,
    "P17",
  );
});

test("P18: a real street of the locality the text does not name is dropped", () => {
  const r = readPost(
    post("Młodów, ul. Leśna"),
    {
      post_type: "water_outage",
      quality_status: null,
      is_past: false,
      items: [
        item("Młodów", "Młodów", "Leśna", "ul. Leśna"),
        item("Młodów", "Młodów", "Warszawska", "ul. Leśna"),
      ],
    },
    PLACES,
    CHECKED,
  );
  assert.equal(r.status, "parsed");
  if (r.status !== "parsed") return;
  assert.deepEqual(
    r.items.map((d) => d.place.streetId),
    ["0606286-10898"],
  );
  assert.equal(r.dropped.length, 1);
  assert.match(r.dropped[0], /^item 2: street_verbatim lacks street name/);
});
