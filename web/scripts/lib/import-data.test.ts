import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeTarget,
  eventsSha256,
  stripPrefix,
  transform,
  validate,
  withTeryt,
} from "./import-data.ts";
import { FIXTURE_IDS, fixture } from "./import-fixture.ts";
import { parseUlic } from "./teryt.ts";

const TODAY = "2026-10-19";
const { etl } = fixture(TODAY, "http://127.0.0.1:1");
const checked = new Map(etl.meta.sources.map((s) => [s.doc, TODAY]));

test("the fixture is valid", () => {
  assert.deepEqual(validate(etl), []);
});

test("validation finds broken ids and references", () => {
  const broken = structuredClone(etl);
  broken.events[0].start = "2026-13-40x";
  broken.streets[0].localityId = "simc-0000000";
  broken.zones[0].members.push({
    localityId: "simc-0972447",
    streetId: "ulic-x",
  });
  const errors = validate(broken).join("\n");
  assert.match(errors, /bad start/);
  assert.match(errors, /not sha256/);
  assert.match(errors, /unknown locality simc-0000000/);
  assert.match(errors, /unknown street ulic-x/);
});

test("prefixes are stripped; the Asnyka URL id survives", () => {
  assert.equal(stripPrefix("simc-0972447"), "0972447");
  assert.equal(stripPrefix("ulic-0972447-00470"), "0972447-00470");
  const { rows } = transform(etl, checked);
  assert.ok(rows.streets.some((s) => s.id === FIXTURE_IDS.asnyka));
  assert.ok(rows.zoneMembers.some((m) => m.streetId === FIXTURE_IDS.asnyka));
  for (const l of rows.localities) assert.doesNotMatch(l.id, /^simc-/);
  // Parents are inserted before their parts.
  const ids = rows.localities.map((l) => l.id);
  assert.ok(ids.indexOf("0605950") < ids.indexOf(FIXTURE_IDS.villagePart));
});

test("labels: village parts carry their village in search", () => {
  const { rows } = transform(etl, checked);
  const search = (id: string) =>
    rows.localities.find((l) => l.id === id)?.search;
  assert.equal(search(FIXTURE_IDS.village), "dabrowa gm lubaczow");
  assert.equal(
    search(FIXTURE_IDS.villagePart),
    "dabrowa basznia gorna gm lubaczow",
  );
  assert.equal(
    rows.streets.find((s) => s.id === "0972447-90101")?.search,
    "osiedle testowe lubaczow",
  );
});

test("sourceRef is readable, the cell stays in payload, putOutBy only for the gmina", () => {
  const { rows } = transform(etl, checked);
  const city = rows.events.find((e) => e.zoneId === "waste:miasto-s1");
  const gmina = rows.events.find((e) => e.zoneId === "waste:gmina-s1");
  assert.equal(city?.sourceRef, "Harmonogram 2026, Miasto Lubaczów, sektor 1");
  assert.deepEqual(city?.payload, {
    sourceCell: "month=1;row=zmieszane;cell=0",
  });
  assert.equal(gmina?.payload?.putOutBy, "06:00");
  assert.equal(city?.checkedAt, TODAY);
  assert.ok(rows.events.every((e) => e.shiftedFrom === null));
  assert.ok(rows.gminy.every((g) => g.scheduleUrl?.startsWith("https://")));
});

test("approvals apply only with the matching events_sha256", () => {
  const zoneId = "waste:miasto-s1";
  const ids = etl.events.filter((e) => e.zoneId === zoneId).map((e) => e.id);
  const hash = eventsSha256(ids);
  assert.equal(hash, eventsSha256([...ids].reverse()));

  const approve = (events_sha256: string | null) =>
    transform(
      etl,
      checked,
      new Map([
        [
          zoneId,
          {
            zone_id: zoneId,
            reviewed_by: "Jakub",
            reviewed_at: "2026-10-20",
            events_sha256,
          },
        ],
      ]),
    );
  const ok = approve(hash);
  assert.equal(ok.zoneHashes.get(zoneId), hash);
  assert.deepEqual(ok.warnings, []);
  const approved = ok.rows.events.filter((e) => e.zoneId === zoneId);
  assert.ok(approved.every((e) => e.verified && e.reviewedBy === "Jakub"));
  assert.ok(
    ok.rows.events.filter((e) => e.zoneId !== zoneId).every((e) => !e.verified),
  );

  for (const stale of [null, "0".repeat(64)]) {
    const result = approve(stale);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.rows.events.every((e) => !e.verified));
  }
});

test("production is the integration's Neon endpoint", () => {
  const prod =
    "postgres://u:p@ep-main-123-pooler.c-2.eu-central-1.aws.neon.tech/db";
  const preview =
    "postgres://u:p@ep-prev-456.c-2.eu-central-1.aws.neon.tech/db";
  const integration = {
    PGHOST: "ep-main-123-pooler.c-2.eu-central-1.aws.neon.tech",
  };
  const t = describeTarget(prod, integration);
  assert.equal(t.production, true);
  assert.equal(t.label, "Neon endpoint ep-main-123 (host masked)");
  assert.doesNotMatch(t.label, /aws|neon\.tech|u:p/);
  assert.equal(describeTarget(preview, {}).production, false);
  assert.equal(describeTarget(preview, integration).production, false);
  assert.equal(
    describeTarget(preview, { VERCEL_ENV: "production" }).production,
    true,
  );
  assert.equal(
    describeTarget("postgres://ci:ci@localhost:5432/x", {}).production,
    false,
  );
});

// As eTERYT serves it: BOM, semicolons, CRLF.
const ULIC = parseUlic(
  [
    "\uFEFFWOJ;POW;GMI;RODZ_GMI;SYM;SYM_UL;CECHA;NAZWA_1;NAZWA_2;STAN_NA",
    "18;09;01;1;0972447;00470;ul.;Asnyka;Adama;2026-10-16",
    "18;09;01;1;0972447;23434;ul.;Ustronna;;2026-10-16",
    "18;09;01;1;0972447;90100;rondo;Rondo Testowe;;2026-10-16",
    "18;09;01;1;0972447;90101;os.;Osiedle Testowe;;2026-10-16",
  ].join("\r\n"),
);

test("street names and types come from TERYT ULIC", () => {
  const named = withTeryt(etl, ULIC);
  assert.deepEqual(named.errors, []);
  assert.deepEqual(named.warnings, []);
  const asnyka = named.etl.streets.find((s) => s.teryt === "00470");
  assert.equal(asnyka?.nazwa1, "Asnyka");
  assert.equal(asnyka?.nazwa2, "Adama");
  const { rows } = transform(named.etl, checked);
  const row = rows.streets.find((s) => s.id === "0972447-00470");
  assert.equal(row?.name, "Adama Asnyka");
  assert.equal(row?.nazwa1, "Asnyka");

  // The ETL's own spelling loses to TERYT's, with a warning.
  const typo = structuredClone(etl);
  typo.streets[0].name = "Adama Asnika";
  typo.streets[0].prefix = "al.";
  const fixed = withTeryt(typo, ULIC);
  assert.match(fixed.warnings.join("\n"), /Asnika.*TERYT/);
  const { rows: fixedRows } = transform(fixed.etl, checked);
  assert.equal(fixedRows.streets[0].name, "Adama Asnyka");
  assert.equal(fixedRows.streets[0].prefix, "ul.");

  // A street TERYT does not have is an error.
  const missing = withTeryt(etl, ULIC.slice(1));
  assert.match(missing.errors.join("\n"), /00470.*not in TERYT ULIC/);
});

test("without TERYT fields the ETL's name stays (before the migration)", () => {
  const { rows } = transform(etl, checked);
  const row = rows.streets.find((s) => s.id === "0972447-00470");
  assert.equal(row?.name, "Adama Asnyka");
  assert.equal(row?.nazwa1, null);
});
