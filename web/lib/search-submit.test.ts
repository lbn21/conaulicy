import assert from "node:assert/strict";
import { test } from "node:test";
import { matcher } from "./search.ts";
import { PLACES } from "./search-fixture.ts";
import { outcomeOf, placeTarget, searchQuery } from "./search-submit.ts";

const index = { places: PLACES, match: matcher(PLACES) };

test("one clear place, typed or picked: straight to its page", () => {
  for (const [q, href] of [
    ["Rynek", "/adres/p239"],
    ["Piłsudskiego", "/adres/p142"],
    ["asnyka 12", "/adres/p062?nr=12"],
    // A picked suggestion's text, also with a number typed after it.
    ["ul. Adama Mickiewicza, Lubaczów", "/adres/p063"],
    ["ul. Rynek, Lubaczów 5", "/adres/p239?nr=5"],
    ["ul. Adama Asnyka 12, Lubaczów", "/adres/p062?nr=12"],
  ]) {
    assert.equal(placeTarget(index, q), href, q);
  }
});

test("several places or none: listed under the field", () => {
  for (const q of ["Kościuszki", "Mickiewicza", "a", "as", "xyzqq", "ul."]) {
    assert.equal(placeTarget(index, q), null, q);
  }
});

test("outcome: several, none, or one", () => {
  const many = outcomeOf(index, "Kościuszki");
  assert.equal(many.kind, "many");
  assert.deepEqual(
    many.kind === "many" && many.hits.map((hit) => hit.id).sort(),
    ["p274", "p275", "p276"],
  );
  assert.deepEqual(outcomeOf(index, "xyzqq"), { kind: "none", q: "xyzqq" });
  assert.deepEqual(outcomeOf(index, "Rynek"), {
    kind: "one",
    hit: { id: "p239", label: "ul. Rynek, Lubaczów" },
  });
});

test("the query as the search reads it", () => {
  assert.equal(searchQuery(null), "");
  assert.equal(searchQuery("   "), "");
  assert.equal(searchQuery("  ul.   Rynek \n 5 "), "ul. Rynek 5");
  assert.equal(searchQuery("x".repeat(150)).length, 100);
});
