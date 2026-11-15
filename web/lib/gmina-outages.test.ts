import assert from "node:assert/strict";
import { test } from "node:test";
import { todayInWarsaw } from "./dates.ts";
import {
  builtOf,
  type GminaPower,
  gminaPower,
  gminaPowerPage,
  gminaWater,
  gminaWaterPage,
  powerPlaces,
  waterPlaces,
} from "./gmina-outages.ts";
import type { Part } from "./hub.ts";
import { uncheckedText } from "./hub.ts";
import { UNREADABLE } from "./live-status.ts";
import { powerInWindow, waterInWindow } from "./now-panel.ts";
import type { OutagePage } from "./outage-view.ts";
import { ours, type PgeFeed, parseOutages } from "./pge-feed.ts";
import { derivedOurs, FAILURE_ID, REVOKED_ID } from "./pge-fixture.ts";
import { POWER_SUBJECT, powerSources } from "./power-module.ts";
import { inWindow } from "./timeline.ts";
import {
  bothViews,
  CHECKED,
  NOW,
  POST_39885,
  storedPost,
} from "./water-fixture.ts";
import { cutSpan, postSlot } from "./water-module.ts";
import { WATER_SOURCES } from "./water-sources.ts";
import { windowOf } from "./window.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

// The gmina-wide outage pages' data and body (lib/gmina-outages.ts), by
// structure and data, never their words (those are read from their
// source): every outage of the gmina, in order, the home panel's count,
// links only to pages the build made, and no check time in the view.

const PGE_NOW = Date.parse("2026-11-11T16:52:00Z");
const MIN = 60_000;
const FEED: PgeFeed = {
  fetchedAt: new Date(PGE_NOW).toISOString(),
  items: ours(
    parseOutages(derivedOurs(), () => {}),
    ZUK_PLACES,
    () => {},
  ),
};
const copy = (failingSince: number | null = null) => ({
  feed: FEED,
  failingSince,
  changedAt: PGE_NOW,
});

/** Every id in TERYT: a deployment that built every place. */
const EVERY = new Set([
  ...ZUK_PLACES.localities.map((l) => l.id),
  ...ZUK_PLACES.streets.map((s) => s.id),
]);

const links = (page: OutagePage) =>
  page.days.flatMap((day) =>
    day.blocks.flatMap((block) =>
      block.rows.flatMap((row) =>
        row.value.flatMap((part: Part) =>
          typeof part === "object" && "href" in part ? [part.href] : [],
        ),
      ),
    ),
  );

const water = () =>
  gminaWater(bothViews([storedPost(POST_39885, CHECKED)], CHECKED, NOW));

test("water: one card per post, day and hours, the home panel's count", () => {
  const data = water();
  const slots = data.cards.map(postSlot);
  assert.equal(new Set(slots).size, slots.length);
  // Every place of every cut of the post is on its slot's card.
  const views = bothViews([storedPost(POST_39885, CHECKED)], CHECKED, NOW);
  const cuts = Object.values(views).flatMap((v) => v.disruptions);
  assert.deepEqual(new Set(slots), new Set(cuts.map(postSlot)));
  assert.ok(data.cards.some((card) => card.places.length > 1));
  // Parity with „Teraz w gminie” (lib/now-panel.ts), on the same files.
  const range = windowOf(todayInWarsaw(NOW));
  const now = NOW.getTime();
  const shown = data.cards.filter((card) =>
    inWindow(cutSpan(card), range, now),
  ).length;
  const counted = Object.values(views).reduce(
    (n, v) => n + waterInWindow(v.disruptions, range, now, () => v.checkedAt),
    0,
  );
  assert.ok(shown > 0);
  assert.equal(shown, counted);
});

test("water: cards by day and start, places in TERYT order", () => {
  const { cards } = water();
  const keys = cards.map((c) => `${c.date}|${c.start}`);
  assert.deepEqual(keys, keys.toSorted());
  const order = new Map(ZUK_PLACES.localities.map((l, i) => [l.id, i]));
  for (const card of cards) {
    const at = card.places.map((p) => order.get(p.place.localityId) ?? -1);
    assert.deepEqual(
      at,
      at.toSorted((a, b) => a - b),
    );
  }
});

test("water: no check time anywhere in the view", () => {
  assert.doesNotMatch(JSON.stringify(water()), /checkedAt/);
});

test("power: no fetch time anywhere in the view", () => {
  assert.doesNotMatch(
    JSON.stringify(gminaPower(copy(), PGE_NOW)),
    /fetchedAt|checkedAt/,
  );
});

test("links: only to the places the build made, each its own subpage", () => {
  const data = water();
  const all = gminaWaterPage(data, builtOf(waterPlaces(data), EVERY));
  assert.ok(links(all).length > 0);
  for (const href of links(all)) assert.match(href, /^\/adres\/[^/]+\/woda$/);
  // None built: no link, the same names as text.
  assert.deepEqual(links(gminaWaterPage(data, [])), []);
  const [one] = builtOf(waterPlaces(data), EVERY);
  assert.deepEqual(links(gminaWaterPage(data, [one])), [
    `/adres/${encodeURIComponent(one)}/woda`,
  ]);
  const power = gminaPower(copy(), PGE_NOW);
  const built = builtOf(powerPlaces(power), EVERY);
  for (const href of links(gminaPowerPage(power, built)))
    assert.match(href, /^\/adres\/[^/]+\/prad$/);
  assert.ok(links(gminaPowerPage(power, built)).length > 0);
});

test("water empty: the address's none line for every source, no AI note", () => {
  const data = gminaWater(bothViews([], CHECKED, NOW));
  const page = gminaWaterPage(data, []);
  assert.deepEqual(page.days, []);
  assert.ok(page.empty);
  assert.equal(page.aiNote, null);
  // Nothing read: the unchecked line, both sources' news.
  const none = gminaWaterPage(gminaWater({}), []);
  assert.ok(none.empty);
  assert.notDeepEqual(none.empty, page.empty);
  // Each source's news when no post is shown.
  assert.equal(none.sources.length, WATER_SOURCES.length);
});

test("water with cuts: no empty line, no calendar, the AI note", () => {
  const page = gminaWaterPage(water(), []);
  assert.equal(page.empty, null);
  assert.equal(page.calendar, null);
  assert.equal(typeof page.aiNote, "string");
});

test("power: every outage still shown, revoked kept, a failure while listed", () => {
  const data = gminaPower(copy(), PGE_NOW) as GminaPower;
  const uuids = data.cuts.map((cut) => cut.uuid);
  assert.ok(uuids.includes(FAILURE_ID));
  assert.ok(uuids.includes(REVOKED_ID));
  // A planned range over is gone; a failure stays whatever its end.
  const later = Date.parse("2026-11-17T09:00:00Z");
  const after = gminaPower(copy(), later) as GminaPower;
  for (const cut of after.cuts)
    if (cut.kind !== "failure")
      for (const r of cut.ranges) assert.ok(Date.parse(r.end) > later);
  assert.ok(after.cuts.some((cut) => cut.uuid === FAILURE_ID));
});

test("power: days ascending, a day's cards by start", () => {
  const data = gminaPower(copy(), PGE_NOW);
  const page = gminaPowerPage(data, []);
  const dates = page.days.map((d) => d.date);
  assert.deepEqual(dates, dates.toSorted());
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(page.empty, null);
  assert.deepEqual(page.sources, powerSources());
});

test("power: the panel's count, on the same copy", () => {
  const data = gminaPower(copy(), PGE_NOW) as GminaPower;
  const range = windowOf(todayInWarsaw(new Date(PGE_NOW)));
  const page = gminaPowerPage(data, []);
  const shown = new Set(
    page.days
      .filter((d) => d.date >= range.from && d.date <= range.to)
      .flatMap((d) => d.blocks.map((b) => b.key.slice(0, 36))),
  );
  const planned = data.cuts
    .filter((cut) => cut.kind === "planned" && !cut.revoked)
    .map((cut) => cut.uuid);
  const counted = [...shown].filter((uuid) => planned.includes(uuid));
  assert.ok(counted.length > 0);
  assert.equal(counted.length, powerInWindow(FEED, range, PGE_NOW));
});

test("power states: no copy, unreadable, failing", () => {
  const none = gminaPowerPage(gminaPower(null, PGE_NOW), []);
  assert.deepEqual(none.empty, [uncheckedText(POWER_SUBJECT)]);
  assert.deepEqual(none.sources, powerSources());
  const unreadable = gminaPowerPage(gminaPower(UNREADABLE, PGE_NOW), []);
  // Never „none” when we do not know: the notice, no empty line.
  assert.equal(unreadable.empty, null);
  assert.ok(unreadable.note);
  assert.deepEqual(unreadable.days, []);
  const failing = gminaPowerPage(
    gminaPower(copy(PGE_NOW - 120 * MIN), PGE_NOW),
    [],
  );
  assert.ok(failing.note);
  assert.ok(failing.days.length > 0);
  const empty = gminaPowerPage(
    gminaPower(
      { feed: { ...FEED, items: [] }, failingSince: null, changedAt: PGE_NOW },
      PGE_NOW,
    ),
    [],
  );
  assert.ok(empty.empty);
  assert.notDeepEqual(empty.empty, none.empty);
});
