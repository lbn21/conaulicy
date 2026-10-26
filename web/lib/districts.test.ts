import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDistricts, unknownStreets } from "./districts.ts";
import { DISTRICTS } from "./districts-seed.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const [first, second] = DISTRICTS.filter((d) => d.streets.length > 0);

test("checkDistricts: the seed's street ids are all TERYT's, of their town", () => {
  checkDistricts(DISTRICTS, ZUK_PLACES.streets);
  assert.deepEqual(unknownStreets(DISTRICTS, ZUK_PLACES.streets), []);
});

test("checkDistricts: throws on a street id TERYT lacks", () => {
  const unknown = `${first.localityId}-99999`;
  assert.throws(
    () =>
      checkDistricts(
        [{ ...first, streets: [{ ...first.streets[0], id: unknown }] }],
        ZUK_PLACES.streets,
      ),
    new RegExp(`not a street of its town: ${first.id}: ${unknown}`),
  );
});

test("checkDistricts: throws on a street of another town", () => {
  assert.throws(
    () =>
      checkDistricts([{ ...first, localityId: "0000000" }], ZUK_PLACES.streets),
    /not a street of its town/,
  );
});

test("checkDistricts: throws on a district id given twice", () => {
  assert.throws(
    () =>
      checkDistricts([first, { ...second, id: first.id }], ZUK_PLACES.streets),
    new RegExp(`district twice: ${first.id}`),
  );
});
