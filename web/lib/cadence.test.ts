import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CADENCES, cadenceOf } from "./cadence.ts";

// vercel.json's cron entries and lib/cadence.ts are one: every cadence has
// its entry, with its schedule, and its path names it back.

const crons = (
  JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "vercel.json"), "utf8"),
  ) as { crons: Array<{ path: string; schedule: string }> }
).crons;

test("every cadence is a cron entry of its own, its path its cadence", () => {
  for (const [cadence, { path, schedule }] of Object.entries(CADENCES)) {
    assert.deepEqual(
      crons.filter((cron) => cron.path === path),
      [{ path, schedule }],
      cadence,
    );
    assert.equal(cadenceOf(`https://conaulicy.pl${path}`), cadence);
  }
});

// Minute 0 every 4 hours lies between two live runs (7, 22, 37, 52), each
// at most maxDuration (5 min) long: no two runs overlap.
test("the water runs never overlap a live run", () => {
  const minutes = (schedule: string) =>
    schedule.split(" ")[0].split(",").map(Number);
  const live = minutes(CADENCES.live.schedule);
  for (const start of minutes(CADENCES.water.schedule))
    for (const other of live) {
      const gap = (((other - start) % 60) + 60) % 60;
      assert.ok(gap >= 5 && gap <= 55, `${start} and ${other}`);
    }
});
