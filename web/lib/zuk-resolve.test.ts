import assert from "node:assert/strict";
import { test } from "node:test";
import type { DisruptionScope } from "./disruptions.ts";
import { normalize } from "./normalize.ts";
import { PLACES } from "./zuk-fixture.ts";
import {
  type Resolved,
  resolvePlace,
  type Wanted,
  type ZukPlaces,
} from "./zuk-resolve.ts";

const WHOLE: DisruptionScope = { type: "whole" };

/** The phrase is "Locality, ul. Street" and the text the phrase, unless given. */
function resolve(over: Partial<Wanted>, text?: string, places = PLACES) {
  const locality = over.locality ?? "";
  const phrase =
    over.phrase ?? (over.street ? `${locality}, ul. ${over.street}` : locality);
  return resolvePlace(
    {
      locality,
      street: null,
      hamlet: null,
      scope: WHOLE,
      ...over,
      phrase,
    },
    text ?? phrase,
    places,
  );
}

function ok(result: Resolved | string): Resolved {
  assert.equal(typeof result, "object", `failed: ${result}`);
  return result as Resolved;
}

const ids = (r: Resolved) => r.places.map((p) => p.streetId ?? p.localityId);

test("street: only among its locality's streets", () => {
  // Leśna is a street of Młodów, Lisie Jamy and Basznia Dolna.
  assert.deepEqual(ids(ok(resolve({ locality: "Młodów", street: "Leśna" }))), [
    "0606286-10898",
  ]);
  assert.deepEqual(
    ids(ok(resolve({ locality: "Lisie Jamy", street: "Leśna" }))),
    ["0606234-10898"],
  );
});

test("street: Lubaczów ul. Żuki is the town's, not Dąbków's or Opaka's part", () => {
  assert.deepEqual(ids(ok(resolve({ locality: "Lubaczów", street: "Żuki" }))), [
    "0972447-26555",
  ]);
});

test("street: the whole name or a unique end of it, with our name as the label", () => {
  const karolowka = ok(
    resolve({ locality: "Karolówka", street: "Sobieskiego" }),
  );
  assert.deepEqual(ids(karolowka), ["0606116-20431"]);
  assert.deepEqual(karolowka.places[0].label, {
    locality: "Karolówka",
    parent: null,
    street: "Jana III Sobieskiego",
  });
  const floriana = ok(resolve({ locality: "Młodów", street: "Floriana" }));
  assert.deepEqual(floriana.places[0].label.street, "św. Floriana");
  assert.deepEqual(ids(ok(resolve({ locality: "Młodów", street: "Pilipy" }))), [
    "0606286-39507",
  ]);
});

test("street: an end two streets share is dropped, never a pick", () => {
  const places: ZukPlaces = {
    localities: [{ id: "1", name: "Wieś", kind: "wies", parentId: null }],
    streets: [
      { id: "1-1", localityId: "1", name: "Jana Kowalskiego" },
      { id: "1-2", localityId: "1", name: "Anny Kowalskiego" },
      { id: "1-3", localityId: "1", name: "Polna" },
      { id: "1-4", localityId: "1", name: "Mała Polna" },
    ],
  };
  assert.match(
    resolve(
      { locality: "Wieś", street: "Kowalskiego" },
      undefined,
      places,
    ) as string,
    /2 streets "Kowalskiego" in Wieś/,
  );
  // "Polna" is a whole name, but also the end of "Mała Polna".
  assert.match(
    resolve({ locality: "Wieś", street: "Polna" }, undefined, places) as string,
    /2 streets "Polna"/,
  );
  assert.deepEqual(
    ids(
      ok(
        resolve(
          { locality: "Wieś", street: "Jana Kowalskiego" },
          undefined,
          places,
        ),
      ),
    ),
    ["1-1"],
  );
});

test("street: not in that locality, or a locality without streets", () => {
  assert.match(
    resolve({ locality: "Młodów", street: "Lwowska" }) as string,
    /0 streets "Lwowska" in Młodów/,
  );
  assert.match(
    resolve({ locality: "Opaka", street: "Polna" }) as string,
    /0 streets/,
  );
});

test("village-wide: the village and every street of its own, from our data", () => {
  const lisie = ok(resolve({ locality: "Lisie Jamy" }));
  const own = PLACES.streets.filter((s) => s.localityId === "0606234");
  assert.equal(own.length, 19);
  assert.deepEqual(ids(lisie), ["0606234", ...own.map((s) => s.id)]);
  assert.ok(lisie.places.every((p) => p.localityId === "0606234"));
  assert.deepEqual(lisie.places[0].label, {
    locality: "Lisie Jamy",
    parent: null,
    street: null,
  });
  assert.deepEqual(
    lisie.places.slice(1).map((p) => p.label.street),
    own.map((s) => s.name),
  );
  // Its village parts (Smolińce, Flisy…) are not added.
  assert.ok(!ids(lisie).includes("0606257"));
  assert.deepEqual(ids(ok(resolve({ locality: "Opaka" }))), ["0606317"]);
});

test("village-wide: house numbers of a village with streets fail", () => {
  assert.match(
    resolve({
      locality: "Młodów",
      scope: { type: "ranges", ranges: [{ from: "1", to: "9" }] },
    }) as string,
    /house numbers for Młodów, which has streets/,
  );
  const opaka = ok(
    resolve({
      locality: "Opaka",
      scope: { type: "ranges", ranges: [{ from: "104", to: "110" }] },
    }),
  );
  assert.deepEqual(opaka.scope, {
    type: "ranges",
    ranges: [{ from: "104", to: "110" }],
  });
});

test("town-wide: all of Lubaczów fails", () => {
  assert.match(resolve({ locality: "Lubaczów" }) as string, /all of Lubaczów/);
});

test("no aliases: a name not on our list is never a place", () => {
  for (const locality of ["Podłęże", "Załuże–Podłęże", "Załuże (Podłęże)"])
    assert.match(
      resolve(
        { locality },
        "Załuże–Podłęże od numeru 44 do numeru 92",
      ) as string,
      /no locality/,
      locality,
    );
  // The model's way: the listed village, the unlisted name as its note,
  // so only part of it (the guards make the scope unknown).
  const zaluze = ok(
    resolve(
      {
        locality: "Załuże",
        phrase: "Załuże (Podłęże)",
        scope: { type: "unknown" },
      },
      "w miejscowościach Antoniki, Załuże (Podłęże)",
    ),
  );
  assert.deepEqual(ids(zaluze), ["0606464"]);
  assert.deepEqual(zaluze.scope, { type: "unknown" });
});

test("hamlet: '(przysiółek Dąbrowa)' is Basznia Górna's Dąbrowa", () => {
  const phrase =
    "Basznia Górna od numeru 121 do numeru 144 (przysiółek Dąbrowa)";
  const r = ok(
    resolve({ locality: "Basznia Górna", hamlet: "Dąbrowa", phrase }),
  );
  assert.deepEqual(ids(r), ["0605967"]);
  assert.deepEqual(r.places[0].label, {
    locality: "Dąbrowa",
    parent: "Basznia Górna",
    street: null,
  });
  assert.match(
    resolve({ locality: "Opaka", hamlet: "Dąbrowa" }) as string,
    /no part "Dąbrowa" of Opaka/,
  );
});

test("shared name: bare Dąbrowa is the village, with Basznia Górna the part", () => {
  assert.deepEqual(ids(ok(resolve({ locality: "Dąbrowa" }))), ["0606010"]);
  assert.deepEqual(
    ids(
      ok(resolve({ locality: "Dąbrowa", phrase: "Basznia Górna (Dąbrowa)" })),
    ),
    ["0605967"],
  );
  // Basznia Górna elsewhere in the post, not in this phrase: the village.
  assert.deepEqual(
    ids(ok(resolve({ locality: "Dąbrowa" }, "Basznia Górna, Dąbrowa"))),
    ["0606010"],
  );
});

test("shared name: two village parts and no village, Mielniki", () => {
  assert.match(
    resolve({ locality: "Mielniki" }) as string,
    /"Mielniki" is 2 localities/,
  );
  assert.deepEqual(
    ids(ok(resolve({ locality: "Mielniki", phrase: "Szczutków (Mielniki)" }))),
    ["0606381"],
  );
});

test("przysiółek: a village part without its village is dropped", () => {
  assert.match(
    resolve({ locality: "Dąbrowa" }, "Opaka, przysiółek Dąbrowa") as string,
    /"przysiółek Dąbrowa" without its village/,
  );
  // With its village in the phrase, it is that village's part.
  assert.deepEqual(
    ids(
      ok(
        resolve(
          { locality: "Dąbrowa", phrase: "Basznia Górna – przysiółek Dąbrowa" },
          "Basznia Górna – przysiółek Dąbrowa",
        ),
      ),
    ),
    ["0605967"],
  );
});

test("longest match: a name only inside a longer one of ours is dropped", () => {
  for (const [short, long] of [
    ["Basznia", "Basznia Dolna"],
    ["Cetynia", "Cetynia Hołodowska"],
    ["Ruda", "Ruda Szczutkowska"],
  ])
    assert.match(
      resolve(
        { locality: short, phrase: short },
        `w miejscowości ${long}`,
      ) as string,
      new RegExp(`"${short}" not named on its own in the text`),
      short,
    );
  // On its own it is the village part.
  assert.deepEqual(ids(ok(resolve({ locality: "Basznia" }))), ["0605909"]);
});

test("street, not a locality: 'ul. Żuki' is never Opaka's part Żuki", () => {
  assert.match(
    resolve(
      { locality: "Żuki", phrase: "Żuki" },
      "Lubaczów ul. Żuki",
    ) as string,
    /"Żuki" not named on its own in the text/,
  );
});

test("literal: the name must be in the text and in the phrase", () => {
  assert.match(
    resolve({ locality: "Opaka", phrase: "Opaka" }, "Dąbków") as string,
    /not named on its own in the text/,
  );
  assert.match(
    resolve({ locality: "Opaka", phrase: "Dąbków" }, "Opaka, Dąbków") as string,
    /not named on its own in "Dąbków"/,
  );
});

test("unknown: no fuzzy match ('Podleśna' is not Podlesie)", () => {
  assert.match(resolve({ locality: "Podleśna" }) as string, /no locality/);
});

test("every name of ours: one place, the one named, or dropped", () => {
  const byId = new Map(PLACES.localities.map((l) => [l.id, l]));
  for (const l of PLACES.localities) {
    const parent = l.parentId ? byId.get(l.parentId)?.name : undefined;
    const phrases = [l.name, ...(parent ? [`${parent} (${l.name})`] : [])];
    for (const phrase of phrases) {
      const r = resolve({ locality: l.name, phrase });
      if (typeof r === "string") continue;
      const localities = new Set(r.places.map((p) => p.localityId));
      assert.equal(localities.size, 1, phrase);
      const [id] = localities;
      // A namesake only when the phrase does not name the part's village.
      assert.equal(normalize(byId.get(id)?.name ?? ""), normalize(l.name));
      if (phrase !== l.name) assert.equal(id, l.id, phrase);
    }
  }
  for (const s of PLACES.streets) {
    const l = byId.get(s.localityId);
    assert.ok(l);
    const words = s.name.split(" ");
    for (let i = 0; i < words.length; i++) {
      const street = words.slice(i).join(" ");
      const r = resolve({ locality: l.name, street });
      if (typeof r === "string") {
        assert.notEqual(i, 0, `${l.name}, ${s.name}: the whole name fails`);
        continue;
      }
      // The street itself matches, so a single match is the street.
      assert.deepEqual(ids(r), [s.id], `${l.name}, ${street}`);
    }
  }
});
