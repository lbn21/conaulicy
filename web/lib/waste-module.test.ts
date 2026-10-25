import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceView } from "./schedule.ts";
import { wasteStatus, wasteSummary } from "./waste-module.ts";

const pickup = (label: string, putOutBy: string | null = null) => ({
  id: label,
  subtype: label.toLowerCase(),
  label,
  putOutBy,
  shiftedFrom: null,
});

const place = (overrides: Partial<PlaceView> = {}): PlaceView => ({
  id: "0972447-00470",
  kind: "ulica",
  name: "ul. Adama Asnyka",
  label: "ul. Adama Asnyka, Lubaczów",
  area: "Lubaczów",
  gmina: "Lubaczów (miasto)",
  zoneId: "zone-1",
  nr: null,
  askNumber: false,
  unknownNr: null,
  today: "2026-10-26",
  schedulePage: null,
  days: [
    { date: "2026-10-20", pickups: [pickup("Papier")] },
    {
      date: "2026-10-28",
      pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
    },
  ],
  sources: [{ label: "Sektor 1", url: null, checkedAt: "2026-10-20" }],
  verified: true,
  ...overrides,
});

test("the summary is the next pickup on or after today", () => {
  assert.deepEqual(wasteSummary(place()), [
    ["Najbliższy odbiór", "28 października 2026"],
    ["Pojemniki", "Zmieszane, Bio"],
    ["Wystaw", "Wystaw pojemniki do 6:00 w dniu odbioru."],
  ]);
});

test("no put-out row without a time", () => {
  const rows = wasteSummary(
    place({ days: [{ date: "2026-10-27", pickups: [pickup("Szkło")] }] }),
  );
  assert.deepEqual(rows, [
    ["Najbliższy odbiór", "27 października 2026"],
    ["Pojemniki", "Szkło"],
  ]);
});

test("nothing to summarise: no dates left, no data, a number to ask", () => {
  assert.equal(wasteSummary(place({ today: "2026-11-01" })), null);
  assert.equal(wasteSummary(place({ zoneId: null, days: [] })), null);
  assert.equal(wasteSummary(place({ askNumber: true, zoneId: null })), null);
});

test("status: unsupported only without any pickup data", () => {
  assert.equal(wasteStatus(place()).state, "ok");
  assert.equal(
    wasteStatus(place({ askNumber: true, zoneId: null })).state,
    "ok",
  );
  assert.equal(
    wasteStatus(place({ zoneId: null, days: [] })).state,
    "unsupported",
  );
  assert.deepEqual(wasteStatus(place()).sources, place().sources);
});
