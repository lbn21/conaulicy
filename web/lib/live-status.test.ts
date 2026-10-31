import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKS_VERSION,
  checkAge,
  IMGW_KEY,
  MAX_AGE_MS,
  nextChecks,
  oldestCheck,
  parseChecks,
  STALE_MS,
  waterKey,
} from "./live-status.ts";

const T0 = "2026-10-31T08:00:00.000Z";
const T1 = "2026-10-31T08:15:00.000Z";

test("the constants: one for every source, water's STALE_MS the same", async () => {
  assert.equal(STALE_MS, 60 * 60_000);
  assert.equal(MAX_AGE_MS, 3 * 3_600_000);
  const { STALE_MS: water } = await import("./zuk-data.ts");
  assert.equal(water, STALE_MS);
  assert.equal(IMGW_KEY, "imgw");
  assert.equal(waterKey("mzgkim"), "water:mzgkim");
});

test("parse: the file round-trips; none, not JSON, another version or shape: null", () => {
  const checks = nextChecks(null, { [IMGW_KEY]: true }, T0);
  assert.deepEqual(parseChecks(JSON.stringify(checks)), checks);
  assert.equal(checks.version, CHECKS_VERSION);
  assert.equal(parseChecks(null), null);
  assert.equal(parseChecks("{"), null);
  assert.equal(parseChecks("null"), null);
  assert.equal(
    parseChecks(JSON.stringify({ ...checks, version: CHECKS_VERSION + 1 })),
    null,
  );
  assert.equal(parseChecks(JSON.stringify({ version: 1 })), null);
  for (const entry of [
    { checkedAt: "soon", attemptAt: T0, ok: true },
    { checkedAt: T0, attemptAt: null, ok: true },
    { checkedAt: T0, attemptAt: T0, ok: "yes" },
  ])
    assert.equal(
      parseChecks(JSON.stringify({ version: 1, sources: { x: entry } })),
      null,
    );
  // Never checked well yet: checkedAt null is a valid entry.
  const never = { checkedAt: null, attemptAt: T0, ok: false };
  assert.deepEqual(
    parseChecks(JSON.stringify({ version: 1, sources: { x: never } })),
    { version: 1, sources: { x: never } },
  );
});

test("next: a good try is the new check, a failed one keeps the last good, others untouched", () => {
  const first = nextChecks(
    null,
    { [IMGW_KEY]: true, [waterKey("mzgkim")]: false },
    T0,
  );
  assert.deepEqual(first.sources, {
    imgw: { checkedAt: T0, attemptAt: T0, ok: true },
    "water:mzgkim": { checkedAt: null, attemptAt: T0, ok: false },
  });
  const second = nextChecks(first, { [IMGW_KEY]: false }, T1);
  assert.deepEqual(second.sources, {
    imgw: { checkedAt: T0, attemptAt: T1, ok: false },
    "water:mzgkim": { checkedAt: null, attemptAt: T0, ok: false },
  });
  // The previous file itself is not changed.
  assert.equal(first.sources.imgw.attemptAt, T0);
});

test("oldest of keys: the oldest last good check; any key without one, or none: null", () => {
  const checks = nextChecks(
    nextChecks(null, { a: true, b: true }, T0),
    { b: true, c: false },
    T1,
  );
  assert.equal(oldestCheck(checks, ["a"]), Date.parse(T0));
  assert.equal(oldestCheck(checks, ["b"]), Date.parse(T1));
  assert.equal(oldestCheck(checks, ["b", "a"]), Date.parse(T0));
  assert.equal(oldestCheck(checks, ["a", "c"]), null);
  assert.equal(oldestCheck(checks, ["a", "missing"]), null);
  assert.equal(oldestCheck(checks, []), null);
  assert.equal(oldestCheck(null, ["a"]), null);
});

test("age: fresh to STALE_MS, stale over it, too old from MAX_AGE_MS", () => {
  const at = Date.parse(T0);
  assert.equal(checkAge(at, at), "fresh");
  assert.equal(checkAge(at, at + STALE_MS), "fresh");
  assert.equal(checkAge(at, at + STALE_MS + 1), "stale");
  assert.equal(checkAge(at, at + MAX_AGE_MS - 1), "stale");
  assert.equal(checkAge(at, at + MAX_AGE_MS), "too-old");
});
