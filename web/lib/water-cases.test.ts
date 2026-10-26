import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "./districts-seed.ts";
import { WATER_CASES } from "./water-cases.ts";
import { GMINA, MZGKIM } from "./water-sources.ts";
import { readPost } from "./zuk.ts";
import { parseAiResult } from "./zuk-ai.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

// Each regression case's expected reading through the gate as the cron
// reads it: the schema's shape, every place kept but those the case
// returns unlisted, and what residents see of the traps.
const PLACES = { ...ZUK_PLACES, districts: DISTRICTS };
const CHECKED = "2026-10-26T18:00:00.000Z";

const read = (id: number) => {
  const c = WATER_CASES.find((x) => x.id === id);
  assert.ok(c, String(id));
  const source = c.source === "mzgkim" ? MZGKIM : GMINA;
  return readPost(c.post(), c.expected(), PLACES, CHECKED, { source });
};

const placesOf = (id: number, date?: string) => {
  const r = read(id);
  assert.equal(r.status, "parsed", JSON.stringify(r));
  return r.status === "parsed"
    ? r.items
        .filter((d) => !date || d.date === date)
        .map((d) => d.place.streetId ?? d.place.localityId)
    : [];
};

test("cases: the twelve posts, each expected reading of the schema's shape", () => {
  assert.deepEqual(
    WATER_CASES.map((c) => c.id).sort((a, b) => a - b),
    [
      4744, 4799, 5108, 5237, 23860, 26028, 31662, 31782, 39495, 39699, 39766,
      39885,
    ],
  );
  for (const c of WATER_CASES)
    assert.deepEqual(
      parseAiResult(JSON.stringify(c.expected())),
      c.expected(),
      String(c.id),
    );
});

test("cases: every place passes the gate, but the unlisted", () => {
  const rejected = Object.fromEntries(
    WATER_CASES.map((c) => {
      const r = read(c.id);
      return [c.id, r.rejected.map((x) => x.reason)];
    }),
  );
  assert.deepEqual(rejected, {
    39885: [],
    39766: [],
    39699: [],
    26028: [],
    39495: [],
    23860: [],
    31662: ["locality not listed", "locality not listed"],
    31782: ["locality not listed"],
    // The Niemirowska estate has its 9 streets (task 185).
    5237: [],
    5108: [],
    4799: [],
    4744: [],
  });
});

test("case 39885: the town's ul. Żuki and Przemysłowa; Opaka's houses", () => {
  const day27 = placesOf(39885, "2026-10-27");
  assert.ok(day27.includes("0972447-26555"));
  assert.ok(day27.includes("0606317"));
  // Opaka's part Żuki is never cut.
  const part = ZUK_PLACES.localities.find(
    (l) => l.name === "Żuki" && l.parentId === "0606317",
  );
  assert.ok(part && !day27.includes(part.id));
  assert.ok(placesOf(39885, "2026-10-28").includes("0972447-17742"));
});

test("cases 31662, 31782: Załuże's houses only, Nowe Sioło linked", () => {
  for (const id of [31662, 31782]) {
    const r = read(id);
    assert.equal(r.status, "parsed");
    if (r.status !== "parsed") continue;
    const zaluze = r.items.filter((d) => d.place.localityId === "0606464");
    assert.ok(zaluze.length > 0);
    for (const d of zaluze)
      assert.deepEqual(d.scope, {
        type: "ranges",
        ranges: [{ from: "263", to: "344" }],
      });
    assert.ok(r.rejected.every((x) => x.words === "Nowe Sioło"));
  }
});
