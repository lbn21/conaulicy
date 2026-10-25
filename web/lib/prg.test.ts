import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { prgNumber } from "./house.ts";
import { prgMatch, prgNote } from "./prg.ts";

const NUMBERS = new Set(["1", "7", "10A", "116/1-3"]);

test("PRG's numbers: trimmed, letters upper case, slash forms kept", () => {
  assert.equal(prgNumber(" 10a "), "10A");
  assert.equal(prgNumber("116/1-3"), "116/1-3");
  assert.equal(prgNumber("  "), null);
});

test("a typed number: itself, a flat's building, or not found", () => {
  assert.equal(prgMatch(NUMBERS, "10a"), "found");
  assert.equal(prgMatch(NUMBERS, "10A"), "found");
  assert.equal(prgMatch(NUMBERS, "7/22"), "found");
  assert.equal(prgMatch(NUMBERS, "116/1-3"), "found");
  assert.equal(prgMatch(NUMBERS, "10"), "not-found");
  assert.equal(prgMatch(NUMBERS, "8/22"), "not-found");
  assert.equal(prgMatch(NUMBERS, "9999"), "not-found");
  assert.equal(prgMatch(undefined, "9999"), "unknown");
});

const place = (id: string, givenNr: string | null, kind = "ulica") =>
  ({ id, kind, givenNr, askNumber: false }) as Parameters<typeof prgNote>[0];

test("the note: only for a number PRG lacks at a place it knows", () => {
  // ul. Adama Asnyka: PRG has 1-7.
  assert.equal(prgNote(place("0972447-00470", "5")), null);
  assert.equal(prgNote(place("0972447-00470", null)), null);
  assert.equal(
    prgNote(place("0972447-00470", "9999")),
    "Nie znaleźliśmy nr 9999 przy tej ulicy w rejestrze adresów. Sprawdź, czy numer jest dobry.",
  );
  // ul. Ofiar Katynia and os. Unii Lubelskiej: no points, so nothing.
  assert.equal(prgNote(place("0972447-14793", "9999")), null);
  assert.equal(prgNote(place("0972447-48373", "9999")), null);
  // Bałaje, a village without streets.
  assert.equal(
    prgNote(place("0605878", "9999", "wies")),
    "Nie znaleźliśmy nr 9999 w tej miejscowości w rejestrze adresów. Sprawdź, czy numer jest dobry.",
  );
  assert.equal(
    prgNote({ ...place("0972447-00470", "9999"), askNumber: true }),
    null,
  );
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
