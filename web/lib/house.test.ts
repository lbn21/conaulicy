import assert from "node:assert/strict";
import { test } from "node:test";
import {
  houseNumber,
  inRange,
  isPartial,
  NR_QUERY,
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

test("?nr= pattern: house numbers go to the cached page, the rest to /numer", () => {
  const nr = new RegExp(`^${NR_QUERY}$`);
  for (const value of ["12", "12a", "12A", "7/22", "12/14b"]) {
    assert.equal(nr.test(value), true, value);
  }
  for (const value of ["", "abc", "12 a", "12345", "7/", "-1"]) {
    assert.equal(nr.test(value), false, value);
  }
});
