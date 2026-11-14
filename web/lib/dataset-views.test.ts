import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureDataset, fixtureRows } from "./dataset-fixture.ts";
import {
  DATASET_SCHEMA_VERSION,
  type Dataset,
  datasetFromRows,
  parseDataset,
  rangedMember,
} from "./dataset-schema.ts";
import {
  datasetPath,
  isDatasetVersion,
  parsePointer,
} from "./dataset-store.ts";
import {
  examplePlacesOf,
  placeIdsOf,
  placeSetOf,
  placeView,
  searchIndexOf,
  wasteWindowOf,
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

test("every place of the fixture has its view; the day filters per call", () => {
  for (const id of placeIdsOf(ds)) assert.ok(placeView(ds, id, TODAY), id);
  const view = placeView(ds, ASNYKA, TODAY);
  assert.ok(view?.days.every((d) => d.date >= TODAY));
  const later = placeView(ds, ASNYKA, "2099-01-01");
  assert.deepEqual(later?.days, []);
  // Past pickups count for the zone's fractions all the same.
  assert.deepEqual(later?.fractions, view?.fractions);
  assert.equal(placeView(ds, "0972447-00000", TODAY), null);
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
  const shown = wasteWindowOf(ds, TODAY, "2026-11-20");
  assert.ok(shown.sources.length > 0 && shown.schedulePage);
  assert.deepEqual(
    examplePlacesOf(ds, [ASNYKA, "0972447-00000"]).map((p) => p.id),
    [ASNYKA],
  );
});

test("a retired place: no view and no page; replaced, it redirects; either way a new place set", () => {
  const replaced = retire(ASNYKA, "0972447-20291");
  assert.equal(placeView(replaced, ASNYKA, TODAY), null);
  assert.equal(replaced.redirects[ASNYKA], "0972447-20291");
  assert.ok(!placeIdsOf(replaced).includes(ASNYKA));
  assert.ok(!searchIndexOf(replaced).places.some(([id]) => id === ASNYKA));
  assert.notEqual(placeSetOf(replaced), placeSetOf(ds));

  const gone = retire(ASNYKA, null);
  assert.equal(gone.redirects[ASNYKA], undefined);
  assert.ok(!placeIdsOf(gone).includes(ASNYKA));
  assert.notEqual(placeSetOf(gone), placeSetOf(replaced));
});

test("the place set: the same places, labels and renames, the same hash", () => {
  assert.match(placeSetOf(ds), /^[0-9a-f]{16}$/);
  // Another day's dates, the same places.
  assert.equal(placeSetOf(fixtureDataset("2027-02-01")), placeSetOf(ds));
  // A label changed: another set.
  const renamed = structuredClone(ds);
  renamed.streets[0].name = `${renamed.streets[0].name} Nowa`;
  assert.notEqual(placeSetOf(renamed), placeSetOf(ds));
  // A zone changed, places kept: the same set.
  const rezoned = structuredClone(ds);
  rezoned.zoneMembers = rezoned.zoneMembers.slice(1);
  assert.equal(placeSetOf(rezoned), placeSetOf(ds));
});

test("a zone member with a house range is refused, on read and on build", () => {
  const ranged = structuredClone(ds) as unknown as {
    zoneMembers: Array<Record<string, unknown>>;
  };
  ranged.zoneMembers[0].parity = "odd";
  assert.throws(
    () => parseDataset(JSON.stringify(ranged)),
    /house range \(parity\)/,
  );
  for (const key of ["houseFrom", "houseTo", "parity"])
    assert.throws(
      () => rangedMember({ zoneId: "z", localityId: "l", [key]: "2" }, "m"),
      new RegExp(key),
    );
  // Null ranges, as the database's columns hold them: fine.
  rangedMember({ houseFrom: null, houseTo: null, parity: null }, "m");
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
