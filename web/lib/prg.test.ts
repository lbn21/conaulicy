import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { houseNumber, prgNumber } from "./house.ts";
import { placePath } from "./places.ts";
import { isValidHouseNumber, numberWarning } from "./prg.ts";
import { PRG_NUMBERS } from "./prg-numbers.generated.ts";

test("PRG's numbers: no spaces, letters upper case, slash forms kept", () => {
  assert.equal(prgNumber(" 10a "), "10A");
  assert.equal(prgNumber("7 a"), "7A");
  assert.equal(prgNumber("116/1-3"), "116/1-3");
  assert.equal(prgNumber("  "), null);
});

// Załuże: the register has 44 and 41A, not 0, 50A or 99999.
const ZALUZE = "0606464";

test("a house number: one of the register's, trimmed and upper case, or a flat of one", () => {
  for (const nr of ["44", "41A", "41a", " 44", "44 ", "44/3", "41a/12", "12/3"])
    assert.equal(isValidHouseNumber(ZALUZE, nr), true, nr);
  for (const nr of [
    "abc",
    "x",
    "-1",
    "44.0",
    "99999",
    "0",
    "50a",
    "50A",
    "+44",
    "4 4",
    "/44",
    "",
  ])
    assert.equal(isValidHouseNumber(ZALUZE, nr), false, nr);
  // A place with no points in the register: nothing is checked.
  assert.equal(isValidHouseNumber("0972447-48373", "abc"), null);
  assert.equal(isValidHouseNumber("0000000", "44"), null);
});

test("the warning: one sentence, the value as given; a street says so", () => {
  const place = (invalidNr: string | null, kind = "wies", askNumber = false) =>
    ({ kind, invalidNr, askNumber }) as Parameters<typeof numberWarning>[0];
  assert.equal(
    numberWarning(place("+44")),
    "Nie znaleźliśmy nr „+44” pod tym adresem – pokazujemy całą miejscowość.",
  );
  assert.equal(
    numberWarning(place("9999", "ulica")),
    "Nie znaleźliśmy nr „9999” pod tym adresem – pokazujemy całą ulicę.",
  );
  assert.equal(numberWarning(place(null)), null);
  // A split street still asking: its own error says it.
  assert.equal(numberWarning(place("9999", "ulica", true)), null);
});

test("the site's own number links pass the check, at every place the register has", () => {
  for (const line of PRG_NUMBERS.trim().split("\n")) {
    const [id, list] = line.split(";");
    for (const token of list.split(",")) {
      // The form search, ?nr= and the pages carry (lib/house.ts).
      const nr = houseNumber(token);
      if (!nr) continue;
      const url = new URL(placePath(id, nr), "https://conaulicy.pl");
      const given = url.searchParams.get("nr") ?? "";
      assert.equal(isValidHouseNumber(id, given), true, `${id} ${given}`);
    }
  }
});

test("the numbers stay on the server: one server-only module reads them", () => {
  const source = (file: string) =>
    readFileSync(path.join(import.meta.dirname, "..", file), "utf8");
  assert.match(source("lib/prg.ts"), /^import "server-only";\n/);
  const readers = ["app", "components", "lib"].flatMap((dir) =>
    readdirSync(path.join(import.meta.dirname, "..", dir), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))
      .map((file) => path.join(dir, file))
      .filter((file) => source(file).includes("prg-numbers.generated")),
  );
  assert.deepEqual(readers, ["lib/prg.ts"]);
});
