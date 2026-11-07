import assert from "node:assert/strict";
import { test } from "node:test";
import {
  houseNumber,
  houseQuery,
  inRange,
  isPartial,
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

test("?nr=: a house number as given, missing when empty or not a number", () => {
  assert.deepEqual(houseQuery(undefined), { nr: null, missing: false });
  assert.deepEqual(houseQuery(""), { nr: null, missing: true });
  for (const value of ["12", "12a", "12A", "7/22", "12/14b", "12 a"]) {
    assert.deepEqual(houseQuery(value), { nr: value, missing: false }, value);
  }
  for (const value of ["abc", " ", "12345", "7/", "-1", "+44"]) {
    assert.deepEqual(houseQuery(value), { nr: value, missing: true }, value);
  }
  assert.deepEqual(houseQuery(["5", "7"]), { nr: "5", missing: false });
});
