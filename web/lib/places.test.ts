import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localitySearchLabel,
  pickZone,
  streetLabel,
  streetName,
  villageLabel,
} from "./places.ts";

test("village parts name their village, villages their gmina", () => {
  const gmina = "Lubaczów (gmina)";
  assert.equal(
    villageLabel({ name: "Dąbrowa", parent: null, gmina }),
    "Dąbrowa (gm. Lubaczów)",
  );
  assert.equal(
    villageLabel({ name: "Dąbrowa", parent: "Basznia Górna", gmina }),
    "Dąbrowa (Basznia Górna, gm. Lubaczów)",
  );
  assert.equal(
    localitySearchLabel({
      name: "Lubaczów",
      kind: "miasto",
      parent: null,
      gmina: "Lubaczów (miasto)",
    }),
    "Lubaczów",
  );
});

test("street names do not repeat their prefix", () => {
  assert.equal(streetName("ul.", "Adama Asnyka"), "ul. Adama Asnyka");
  assert.equal(streetName("os.", "Osiedle Mickiewicza"), "Osiedle Mickiewicza");
  assert.equal(
    streetName("al.", "aleja kardynała Mariana Jaworskiego"),
    "aleja kardynała Mariana Jaworskiego",
  );
  assert.equal(
    streetName("rondo", "Rondo im. Zesłańców Sybiru"),
    "Rondo im. Zesłańców Sybiru",
  );
  assert.equal(streetName("os.", "Słoneczne"), "os. Słoneczne");
  assert.equal(
    streetLabel({ prefix: "ul.", name: "Polna", locality: "Lisie Jamy" }),
    "ul. Polna, Lisie Jamy",
  );
});

test("pickZone: street entry, then own locality, then the parent village", () => {
  const street = { zoneId: "z-street", localityId: "L", streetId: "L-1" };
  const own = { zoneId: "z-own", localityId: "P1", streetId: null };
  const parent = { zoneId: "z-parent", localityId: "V", streetId: null };
  const part = { localityId: "P1", parentId: "V" };

  assert.equal(pickZone([parent], part), "z-parent");
  assert.equal(pickZone([parent, own], part), "z-own");
  assert.equal(pickZone([], part), null);
  assert.equal(
    pickZone([street, { zoneId: "z-town", localityId: "L", streetId: null }], {
      localityId: "L",
      parentId: null,
      streetId: "L-1",
    }),
    "z-street",
  );
  // Another street's entry never counts.
  assert.equal(
    pickZone([street], { localityId: "L", parentId: null, streetId: "L-2" }),
    null,
  );
});
