import assert from "node:assert/strict";
import { test } from "node:test";
import { streetLabel, villageLabel } from "./places.ts";
import { prgNote } from "./prg.ts";
import { matcher, type SearchIndex } from "./search.ts";
import { HINT, HINT_EXAMPLES } from "./search-hint.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

// Every street and locality TERYT has in both gminy, labelled as the site's
// index labels them.
const names = new Map(ZUK_PLACES.localities.map((l) => [l.id, l.name]));
const INDEX: SearchIndex = [
  ...ZUK_PLACES.streets.map((s): SearchIndex[number] => [
    s.id,
    streetLabel({
      prefix: s.cecha,
      name: s.name,
      locality: names.get(s.localityId) ?? "",
    }),
    s.cecha,
  ]),
  ...ZUK_PLACES.localities.map((l): SearchIndex[number] => [
    l.id,
    l.kind === "miasto"
      ? l.name
      : villageLabel({
          name: l.name,
          parent: l.parentId ? (names.get(l.parentId) ?? null) : null,
          gmina: "Lubaczów",
        }),
    l.kind,
  ]),
];
const match = matcher(INDEX);

test("the hint quotes every example", () => {
  assert.equal(
    HINT,
    "Na przykład Asnyka 5 albo Lisie Jamy – polskie znaki nie są potrzebne",
  );
  for (const { text } of HINT_EXAMPLES) assert.ok(HINT.includes(text), text);
});

for (const { text, id, nr } of HINT_EXAMPLES) {
  test(`"${text}": one place${nr ? ", a number the register has" : ""}`, () => {
    const [hit] = match(text).hits;
    assert.equal(hit?.id, id);
    assert.equal(hit?.nr ?? null, nr);

    const street = ZUK_PLACES.streets.find((s) => s.id === id);
    const locality = ZUK_PLACES.localities.find((l) => l.id === id);
    assert.ok(street || locality, `${id} not in ZUK_PLACES`);
    // The only place of that name in both gminy.
    const same = street
      ? ZUK_PLACES.streets.filter((s) => s.name1 === street.name1)
      : ZUK_PLACES.localities.filter((l) => l.name === locality?.name);
    assert.equal(same.length, 1);

    if (nr) {
      const place = (givenNr: string) =>
        ({
          id,
          kind: street ? "ulica" : "wies",
          givenNr,
          askNumber: false,
        }) as Parameters<typeof prgNote>[0];
      assert.equal(prgNote(place(nr)), null);
      // Control: a number PRG lacks there gets the note.
      assert.notEqual(prgNote(place("12")), null);
    }
  });
}
