// Adversarial readings: what a model could get wrong about places, through
// the whole pipeline (guards, then the resolver). A wrong place must never
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
  street: string | null,
  place_verbatim: string,
  note: string | null = null,
): AiItem => ({
  date: "2026-11-05",
  start: "09:00",
  end: "14:00",
  locality,
  street,
  place_verbatim,
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
      read(long, [item(short, null, short)]),
      /not named on its own in the text/,
      probe,
    );
});

test("P4: 'przysiółek Dąbrowa' without Basznia Górna is dropped", () => {
  dropped(
    read("Opaka, przysiółek Dąbrowa", [
      item("Dąbrowa", null, "przysiółek Dąbrowa"),
    ]),
    /without its village/,
    "P4",
  );
});

test("P5: bare Mielniki, two village parts, is dropped", () => {
  dropped(
    read("Mielniki", [item("Mielniki", null, "Mielniki")]),
    /is 2 localities/,
    "P5",
  );
});

test("P6: 'Lubaczów ul. Żuki' read as the village part Żuki is dropped", () => {
  dropped(
    read("Lubaczów ul. Żuki", [item("Żuki", null, "Żuki")]),
    /not named on its own/,
    "P6",
  );
});

test("P7: 'Szczutków (Mielniki)' is Szczutków's Mielniki", () => {
  assert.deepEqual(
    read("Szczutków (Mielniki)", [
      item("Mielniki", null, "Szczutków (Mielniki)"),
    ]),
    ["0606381"],
  );
});

test("P8: an unlisted name alone, given a village, is dropped", () => {
  dropped(
    read("Podłęże", [item("Załuże", null, "Podłęże", "Podłęże")]),
    /locality "Załuże" not in "Podłęże"/,
    "P8",
  );
});

test("P9: an unlisted name as the locality is dropped", () => {
  dropped(
    read("Załuże–Podłęże", [item("Podłęże", null, "Podłęże")]),
    /no locality "Podłęże"/,
    "P9",
  );
});

test("P10: a place the text does not have is dropped", () => {
  dropped(
    read("Dąbków", [item("Opaka", null, "Opaka")]),
    /"Opaka" not in the text/,
    "P10",
  );
});

test("P11: 'ul. 3 Maja' for our '3-go Maja' is dropped, not matched", () => {
  const places: ZukPlaces = {
    ...PLACES,
    streets: [
      ...PLACES.streets,
      { id: "0972447-00001", localityId: "0972447", name: "3-go Maja" },
    ],
  };
  dropped(
    read(
      "Lubaczów, ul. 3 Maja",
      [item("Lubaczów", "3 Maja", "Lubaczów, ul. 3 Maja")],
      places,
    ),
    /0 streets "3 Maja" in Lubaczów/,
    "P11",
  );
});

test("P12: another locality's street is never borrowed", () => {
  // Lwowska is a street of Lisie Jamy, not of Młodów.
  dropped(
    read("Młodów, ul. Lwowska", [
      item("Młodów", "Lwowska", "Młodów, ul. Lwowska"),
    ]),
    /0 streets "Lwowska" in Młodów/,
    "P12",
  );
});

test("P13: 'Dąbrowa i Krowica Lasowa' is the village Dąbrowa and Krowica Lasowa", () => {
  assert.deepEqual(
    read("Dąbrowa i Krowica Lasowa", [
      item("Dąbrowa", null, "Dąbrowa"),
      item("Krowica Lasowa", null, "Krowica Lasowa"),
    ]),
    ["0606010", "0606168"],
  );
});

test("P14: 'Zaluze' normalized by the model to Załuże is dropped", () => {
  dropped(
    read("Zaluze", [item("Załuże", null, "Zaluze")]),
    /locality "Załuże" not in "Zaluze"/,
    "P14",
  );
});

test("P15: 'Basznia Dolna, ul. Leśna' read as Basznia is dropped", () => {
  dropped(
    read("Basznia Dolna, ul. Leśna", [
      item("Basznia", "Leśna", "Basznia Dolna, ul. Leśna"),
    ]),
    /"Basznia" not named on its own in the text/,
    "P15",
  );
});

test("P16: one bad place drops only that place", () => {
  assert.deepEqual(
    read("Basznia Dolna, Opaka", [
      item("Basznia", null, "Basznia"),
      item("Opaka", null, "Opaka"),
    ]),
    ["0606317"],
  );
});

test("P17: 'ul. Podleśna' read as our street Leśna is dropped", () => {
  // The phrase guard sees "leśna" inside "podleśna"; the resolver does not.
  dropped(
    read("Lisie Jamy, ul. Podleśna", [
      item("Lisie Jamy", "Leśna", "Lisie Jamy, ul. Podleśna"),
    ]),
    /street "Leśna" not in the text/,
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
        item("Młodów", "Leśna", "Młodów, ul. Leśna"),
        item("Młodów", "Warszawska", "Młodów, ul. Leśna"),
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
  assert.match(r.dropped[0], /^item 2: street "Warszawska" not in/);
});
