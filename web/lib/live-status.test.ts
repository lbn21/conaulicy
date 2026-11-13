import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKS_VERSION,
  checksChanged,
  failingSince,
  IMGW_KEY,
  liveCopyOf,
  liveNotice,
  nextChecks,
  parseChecks,
  waterKey,
} from "./live-status.ts";

const T0 = "2026-10-31T08:00:00.000Z";
const T1 = "2026-10-31T08:15:00.000Z";
const T2 = "2026-10-31T08:30:00.000Z";

test("the keys: one for every source", () => {
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
  assert.equal(parseChecks(JSON.stringify({ version: CHECKS_VERSION })), null);
  for (const entry of [
    { ok: true, since: "soon" },
    { ok: "yes", since: T0 },
    { ok: true },
  ])
    assert.equal(
      parseChecks(
        JSON.stringify({ version: CHECKS_VERSION, sources: { x: entry } }),
      ),
      null,
    );
});

test("next: a source in the same state keeps its entry, a flip begins at the run, others untouched", () => {
  const first = nextChecks(
    null,
    { [IMGW_KEY]: true, [waterKey("mzgkim")]: false },
    T0,
  );
  assert.deepEqual(first.sources, {
    imgw: { ok: true, since: T0 },
    "water:mzgkim": { ok: false, since: T0 },
  });
  const same = nextChecks(first, { [IMGW_KEY]: true }, T1);
  assert.deepEqual(same, first);
  const flipped = nextChecks(same, { [IMGW_KEY]: false }, T2);
  assert.deepEqual(flipped.sources, {
    imgw: { ok: false, since: T2 },
    "water:mzgkim": { ok: false, since: T0 },
  });
  // The previous file itself is not changed.
  assert.equal(first.sources.imgw.ok, true);
});

test("written only when the content changes: never for a run that went as the last", () => {
  const first = nextChecks(null, { [IMGW_KEY]: true }, T0);
  assert.ok(checksChanged(null, first));
  // A day of good runs after the first: no write.
  let stored = first;
  let writes = 0;
  for (let i = 1; i < 96; i++) {
    const at = new Date(Date.parse(T0) + i * 15 * 60_000).toISOString();
    const next = nextChecks(stored, { [IMGW_KEY]: true }, at);
    if (checksChanged(stored, next)) {
      stored = next;
      writes++;
    }
  }
  assert.equal(writes, 0);
  // A flip, and a new source: written.
  assert.ok(checksChanged(first, nextChecks(first, { [IMGW_KEY]: false }, T1)));
  assert.ok(checksChanged(first, nextChecks(first, { pge: true }, T1)));
});

test("failing since: the run the failure began at, whatever its age; null while good", () => {
  const good = nextChecks(null, { [IMGW_KEY]: true }, T0);
  assert.equal(failingSince(good, IMGW_KEY), null);
  assert.equal(failingSince(null, IMGW_KEY), null);
  assert.equal(failingSince(good, "missing"), null);
  const failing = nextChecks(good, { [IMGW_KEY]: false }, T1);
  assert.equal(failingSince(failing, IMGW_KEY), Date.parse(T1));
  assert.equal(
    failingSince(nextChecks(failing, { [IMGW_KEY]: false }, T2), IMGW_KEY),
    Date.parse(T1),
  );
});

test("the copy: the feed as stored, whatever its age; failing from the status file", () => {
  const feed = { fetchedAt: T0, items: [] };
  const good = JSON.stringify(nextChecks(null, { [IMGW_KEY]: true }, T0));
  assert.deepEqual(liveCopyOf(feed, good, IMGW_KEY), {
    feed,
    failingSince: null,
    changedAt: Date.parse(T0),
  });
  const failing = JSON.stringify(nextChecks(null, { [IMGW_KEY]: false }, T1));
  assert.equal(
    liveCopyOf(feed, failing, IMGW_KEY)?.failingSince,
    Date.parse(T1),
  );
  assert.equal(liveCopyOf(null, good, IMGW_KEY), null);
});

test("the notice: none while good, whatever the age; failing, since when", () => {
  const later = Date.parse(T0) + 30 * 24 * 3_600_000;
  assert.equal(liveNotice("danych PGE", null, later, 3), null);
  const failing = Date.parse(T1);
  assert.match(
    liveNotice("danych PGE", failing, failing + 60_000, 1) ?? "",
    /9:15/,
  );
  assert.notEqual(
    liveNotice("danych PGE", failing, failing, 1),
    liveNotice("danych PGE", failing, failing, 0),
  );
});
