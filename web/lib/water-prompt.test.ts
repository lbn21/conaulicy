import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "./districts-seed.ts";
import { gminaLubaczow } from "./sources/gmina-lubaczow/index.ts";
import { mzgkim } from "./sources/mzgkim/index.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

const PLACES: ZukPlaces = { ...ZUK_PLACES, districts: DISTRICTS };
const SOURCES = [gminaLubaczow, mzgkim];

/** The context: what follows the rules. */
const contextOf = (prompt: string) =>
  prompt.slice(prompt.indexOf("Our places"));
/** The source's header and the shared rules: what precedes the context. */
const textOf = (prompt: string) =>
  prompt.slice(0, prompt.indexOf("Our places"));

test("prompt: byte-stable for the same places in any order", () => {
  const shuffled: ZukPlaces = {
    localities: [...PLACES.localities].reverse(),
    streets: [...PLACES.streets].reverse(),
    districts: [...DISTRICTS].reverse(),
  };
  for (const source of SOURCES) {
    const prompt = source.systemPrompt(PLACES);
    assert.equal(source.systemPrompt(shuffled), prompt, source.id);
    assert.ok(prompt.endsWith("\n"));
  }
});

test("prompt: one set of rules, a header of each source's own", () => {
  const [gmina, town] = SOURCES.map((s) => s.systemPrompt(PLACES));
  const rules = (p: string) => p.slice(p.indexOf("Read the post and return"));
  assert.equal(
    rules(textOf(gmina)),
    rules(textOf(town)),
    "the shared rules are the same text",
  );
  assert.notEqual(textOf(gmina), textOf(town));
});

test("prompt: the context is the source's area, the districts once", () => {
  const gmina = contextOf(gminaLubaczow.systemPrompt(PLACES));
  const town = contextOf(mzgkim.systemPrompt(PLACES));
  assert.match(gmina, /\nVillages: Antoniki, /);
  assert.doesNotMatch(town, /Villages:|Opaka|Pilipy/);
  assert.match(town, /\nTowns: Lubaczów\n/);
  assert.match(town, /\nParts: Mazury \(Lubaczów\), Niwki \(Lubaczów\), /);
  assert.match(gmina, /\nParts: Basznia \(Basznia Dolna\), /);
  // The streets of each listed locality, by TERYT name, no CECHA or id.
  assert.match(gmina, /\nMłodów: .*Pilipy/);
  assert.match(town, /\nLubaczów: 3-go Maja, Adama Asnyka, /);
  assert.doesNotMatch(town, /ul\. 3-go Maja|0972447/);
  for (const context of [gmina, town]) {
    assert.equal(context.split("Districts of Lubaczów").length, 2);
    assert.match(context, /\n- Osiedle Mazury; forms: .*; streets: /);
    assert.match(context, /\n- Osiedle za Koleją; forms: .*; no streets\b/);
  }
});

test("prompt: no real place in the rules or headers; examples invented", () => {
  for (const source of SOURCES) {
    const text = textOf(source.systemPrompt(PLACES));
    for (const l of ZUK_PLACES.localities)
      assert.doesNotMatch(
        text,
        new RegExp(`(?<!\\p{L})${l.name}(?!\\p{L})`, "u"),
        `${source.id}: ${l.name}`,
      );
    for (const d of DISTRICTS)
      assert.equal(text.includes(d.name), false, `${source.id}: ${d.name}`);
  }
});

test("prompt: a listed name used twice throws", () => {
  const [first] = ZUK_PLACES.localities.filter((l) => l.kind === "wies");
  const twice = {
    ...ZUK_PLACES,
    localities: [...ZUK_PLACES.localities, { ...first, id: "9999999" }],
  };
  assert.throws(() => gminaLubaczow.systemPrompt(twice), /listed twice/);
});
