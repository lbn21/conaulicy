import assert from "node:assert/strict";
import { test } from "node:test";
import type { DisruptionScope } from "./disruptions.ts";
import { PLACES } from "./zuk-fixture.ts";
import { type Resolved, resolvePlace, type Wanted } from "./zuk-resolve.ts";

const WHOLE: DisruptionScope = { type: "whole" };
const resolve = (over: Partial<Wanted>) =>
  resolvePlace(
    { locality: "", street: null, hamlet: null, scope: WHOLE, ...over },
    PLACES,
  );

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

test("street: by NAZWA_1 or the end of the name, 'Sobieskiego'", () => {
  assert.deepEqual(
    ids(ok(resolve({ locality: "Karolówka", street: "Sobieskiego" }))),
    ["0606116-20431"],
  );
  assert.deepEqual(ids(ok(resolve({ locality: "Młodów", street: "Pilipy" }))), [
    "0606286-39507",
  ]);
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

test("village-wide: the village and every street of its own", () => {
  const lisie = ok(resolve({ locality: "Lisie Jamy" }));
  const own = PLACES.streets.filter((s) => s.localityId === "0606234");
  assert.equal(own.length, 19);
  assert.deepEqual(ids(lisie), ["0606234", ...own.map((s) => s.id)]);
  assert.ok(lisie.places.every((p) => p.localityId === "0606234"));
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

test("alias: Podłęże is part of Załuże, in every form ZUK writes it", () => {
  const range: DisruptionScope = {
    type: "ranges",
    ranges: [{ from: "44", to: "92" }],
  };
  const dash = ok(resolve({ locality: "Załuże–Podłęże", scope: range }));
  assert.deepEqual(ids(dash), ["0606464"]);
  assert.deepEqual(dash.scope, range);
  for (const locality of ["Załuże (Podłęże)", "Załuże-Podłęże", "Podłęże"]) {
    const r = ok(resolve({ locality }));
    assert.deepEqual(ids(r), ["0606464"], locality);
    // Only part of Załuże: never the whole village.
    assert.deepEqual(r.scope, { type: "unknown" }, locality);
  }
});

test("hamlet: '(przysiółek Dąbrowa)' is Basznia Górna's Dąbrowa", () => {
  const r = ok(resolve({ locality: "Basznia Górna", hamlet: "Dąbrowa" }));
  assert.deepEqual(ids(r), ["0605967"]);
  assert.match(
    resolve({ locality: "Opaka", hamlet: "Dąbrowa" }) as string,
    /no part "Dąbrowa" of Opaka/,
  );
});

test("ambiguous: Dąbrowa is a village and a part of Basznia Górna", () => {
  assert.match(resolve({ locality: "Dąbrowa" }) as string, /is 2 localities/);
});

test("unknown: no fuzzy match ('Podleśna' is not Podlesie)", () => {
  assert.match(resolve({ locality: "Podleśna" }) as string, /no locality/);
});
