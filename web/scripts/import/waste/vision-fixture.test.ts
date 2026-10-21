import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../core/config.ts";
import type { WasteSource } from "./adapters.ts";
import { MIASTO_ROWS, parseVisionJson, streetReview } from "./lib.ts";
import { DB_STREETS, GROK_RESULTS } from "./vision-fixture.ts";

const aliases = (
  loadConfig().sources.find((s) => s.id === "miasto") as WasteSource
).waste.aliases;

test("the five real Grok replies parse; streets go to review only where they differ", () => {
  const flagged = GROK_RESULTS.map((text, i) => {
    const reading = parseVisionJson(text, Object.keys(MIASTO_ROWS));
    assert.equal(reading.sector, i + 1);
    assert.equal(reading.year, 2026);
    const zone = `waste:miasto-s${i + 1}`;
    const members = DB_STREETS[zone].map((n) => ({ id: n, names: [n] }));
    return streetReview(zone, [reading.streets], members, aliases);
  });
  assert.deepEqual(flagged, [
    // Full names on the image, short ones in the database: aliases.
    [],
    [],
    [],
    // Misread by the model.
    [
      "waste:miasto-s4: „Gen. Antoniego Jeziorskiego” is not a member now (pass 1)",
      "waste:miasto-s4: „Gen. Antoniego Jeziorańskiego” is no longer listed (pass 1)",
    ],
    [],
  ]);
});
