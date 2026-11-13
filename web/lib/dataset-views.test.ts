import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureDataset, fixtureRows } from "./dataset-fixture.ts";
import {
  DATASET_SCHEMA_VERSION,
  type Dataset,
  datasetFromRows,
  parseDataset,
} from "./dataset-schema.ts";
import {
  datasetPath,
  isDatasetVersion,
  parsePointer,
} from "./dataset-store.ts";
import {
  examplePlacesOf,
  placeIdsOf,
  placeView,
  retiredPlaceOf,
  searchIndexOf,
  wasteWeekOf,
  zoneView,
} from "./dataset-views.ts";

const TODAY = "2026-11-13";
const ds = fixtureDataset(TODAY);
const { streets, localities } = fixtureRows(TODAY);
const ASNYKA = "0972447-00470";

/** The fixture with one street retired, replaced by `to` or by nothing. */
function retire(id: string, to: string | null): Dataset {
  const rows = fixtureRows(TODAY);
  return datasetFromRows(
    {
      ...rows,
      streets: rows.streets.map((s) =>
        s.id === id
          ? { ...s, retiredAt: "2026-11-13 04:17:00+00", replacedBy: to }
          : s,
      ),
      seen: new Map(),
      districts: [],
    },
    { generatedAt: `${TODAY}T00:00:00.000Z` },
  );
}

test("the snapshot reads back as written; anything else is refused", () => {
  assert.deepEqual(parseDataset(JSON.stringify(ds)), ds);
  assert.throws(
    () => parseDataset(JSON.stringify({ ...ds, schemaVersion: 99 })),
    /schemaVersion/,
  );
  const broken = structuredClone(ds) as unknown as {
    events: Array<{ start: unknown }>;
  };
  broken.events[3].start = 20261113;
  assert.throws(
    () => parseDataset(JSON.stringify(broken)),
    /dataset\.events\[3\]\.start is not a string/,
  );
  assert.equal(ds.schemaVersion, DATASET_SCHEMA_VERSION);
});

test("only what the site shows: no payload but putOutBy, no hashes or raw cells", () => {
  const keys = new Set(ds.events.flatMap((e) => Object.keys(e)));
  for (const key of [
    "sourceSha256",
    "reviewedBy",
    "reviewedAt",
    "allDay",
    "end",
  ])
    assert.ok(!keys.has(key), key);
  for (const event of ds.events)
    assert.ok(
      event.payload === null ||
        Object.keys(event.payload).join() === "putOutBy",
    );
});

test("every place of the fixture has its view; the day and number filter per call", () => {
  for (const id of placeIdsOf(ds))
    assert.ok(placeView(ds, id, null, TODAY), id);
  const view = placeView(ds, ASNYKA, null, TODAY);
  assert.ok(view?.days.every((d) => d.date >= TODAY));
  const later = placeView(ds, ASNYKA, null, "2099-01-01");
  assert.deepEqual(later?.days, []);
  // Past pickups count for the zone's fractions all the same.
  assert.deepEqual(later?.fractions, view?.fractions);
  assert.equal(placeView(ds, "0972447-00000", null, TODAY), null);
});

test("the search index, /ulice and the sitemap cover every listed place", () => {
  const index = searchIndexOf(ds);
  assert.equal(searchIndexOf(ds), index, "built once per snapshot");
  assert.equal(
    index.places.length,
    streets.filter((s) => s.prefix === "ul.").length +
      localities.filter((l) => l.kind !== "miasto").length,
  );
  assert.match(index.version, /^[0-9a-f]{16}$/);
});

test("zones, the panel and the examples read the same snapshot", () => {
  const zone = zoneView(ds, ds.zones[0].id, TODAY);
  assert.ok(zone?.gmina);
  assert.ok(zone?.events.every((e) => e.start >= TODAY));
  assert.equal(zoneView(ds, "waste:none", TODAY), null);
  const week = wasteWeekOf(ds, TODAY, "2026-11-20");
  assert.ok(week.sources.length > 0 && week.schedulePage);
  assert.deepEqual(
    examplePlacesOf(ds, [ASNYKA, "0972447-00000"]).map((p) => p.id),
    [ASNYKA],
  );
});

test("a retired place: no view, its id kept; replaced, it redirects; else it is gone", () => {
  const replaced = retire(ASNYKA, "0972447-20291");
  assert.equal(placeView(replaced, ASNYKA, null, TODAY), null);
  assert.equal(replaced.redirects[ASNYKA], "0972447-20291");
  assert.equal(retiredPlaceOf(replaced, ASNYKA), null);
  assert.ok(placeIdsOf(replaced).includes(ASNYKA));
  assert.ok(!searchIndexOf(replaced).places.some(([id]) => id === ASNYKA));

  const gone = retire(ASNYKA, null);
  assert.equal(gone.redirects[ASNYKA], undefined);
  assert.equal(retiredPlaceOf(gone, ASNYKA)?.kind, "ulica");
  assert.equal(retiredPlaceOf(gone, "0972447-20291"), null);
});

test("the pointer names one immutable version", () => {
  const version = "20261113T140221Z-1a2b3c4d5e6f";
  assert.ok(isDatasetVersion(version));
  const pointer = {
    version,
    path: datasetPath(version),
    sha256: "f".repeat(64),
    generatedAt: "2026-11-13T14:02:21.000Z",
    previous: null,
  };
  assert.deepEqual(parsePointer(JSON.stringify(pointer)), pointer);
  assert.throws(() =>
    parsePointer(JSON.stringify({ ...pointer, path: "dataset/other.json" })),
  );
});
