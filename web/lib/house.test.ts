import assert from "node:assert/strict";
import { test } from "node:test";
import {
  houseNumber,
  inRange,
  isPartial,
  readings,
  withHouseNumber,
} from "./house.ts";

test("house numbers in Polish formats", () => {
  assert.equal(houseNumber("12"), "12");
  assert.equal(houseNumber("12a"), "12a");
  assert.equal(houseNumber("12A"), "12a");
  assert.equal(houseNumber(" 7/22 "), "7/22");
  assert.equal(houseNumber("12/14"), "12/14");
  assert.equal(houseNumber("12 a"), "12a");
  for (const bad of ["", "a12", "12ab", "12345", "1/2/3", "Asnyka", null]) {
    assert.equal(houseNumber(bad), null, String(bad));
  }
});

test("a number is peeled off the end or the front, not from the middle", () => {
  assert.deepEqual(readings("Asnyka 12")[0], { text: "Asnyka", nr: "12" });
  assert.deepEqual(readings("ul. Asnyka 12a")[0], {
    text: "ul. Asnyka",
    nr: "12a",
  });
  assert.deepEqual(readings("Asnyka 7/22")[0], { text: "Asnyka", nr: "7/22" });
  assert.deepEqual(readings("12 Asnyka"), [
    { text: "12 Asnyka", nr: null },
    { text: "Asnyka", nr: "12" },
  ]);
  // "3 Maja" is a street: as typed comes before a leading number.
  assert.deepEqual(readings("3 Maja")[0], { text: "3 Maja", nr: null });
  assert.deepEqual(readings("3 Maja 5")[0], { text: "3 Maja", nr: "5" });
  // A number alone stays the query.
  assert.deepEqual(readings("12"), [{ text: "12", nr: null }]);
  assert.deepEqual(readings("Asnyka"), [{ text: "Asnyka", nr: null }]);
});

test("the number goes after the street or village name", () => {
  assert.equal(
    withHouseNumber("ul. Adama Asnyka, Lubaczów", "12"),
    "ul. Adama Asnyka 12, Lubaczów",
  );
  assert.equal(
    withHouseNumber("Dąbrowa (Basznia Górna, gm. Lubaczów)", "7"),
    "Dąbrowa 7 (Basznia Górna, gm. Lubaczów)",
  );
  assert.equal(
    withHouseNumber("ul. Adama Asnyka", "12a"),
    "ul. Adama Asnyka 12a",
  );
  assert.equal(withHouseNumber("ul. Adama Asnyka", null), "ul. Adama Asnyka");
});

test("even, odd, ranges and letters", () => {
  const whole = { houseFrom: null, houseTo: null, parity: null };
  const even = { houseFrom: null, houseTo: null, parity: "even" as const };
  const odd = { houseFrom: null, houseTo: null, parity: "odd" as const };
  const upTo20 = { houseFrom: "1", houseTo: "20", parity: null };
  const from12b = { houseFrom: "12b", houseTo: null, parity: null };

  assert.equal(isPartial(whole), false);
  assert.equal(isPartial(even), true);
  assert.equal(inRange("12", whole), true);
  assert.equal(inRange("12", even), true);
  assert.equal(inRange("12a", even), true);
  assert.equal(inRange("13", even), false);
  assert.equal(inRange("13", odd), true);
  assert.equal(inRange("7/22", odd), true);
  assert.equal(inRange("12/14", even), true);
  assert.equal(inRange("20", upTo20), true);
  assert.equal(inRange("20a", upTo20), false);
  assert.equal(inRange("21", upTo20), false);
  assert.equal(inRange("12a", from12b), false);
  assert.equal(inRange("12b", from12b), true);
  assert.equal(inRange("12c", from12b), true);
  assert.equal(inRange("13", from12b), true);
  assert.equal(inRange("abc", whole), false);
});
