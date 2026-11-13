// End-to-end check of the importer on a made-up dataset (never the real one):
// an empty database, dry run, a first --apply (its places reviewed first),
// then the pages read the imported data through the dataset snapshot it
// publishes (DATASET_DIR, scripts/lib/dataset.ts; lib/dataset.ts). Also the
// guards: changed sources, too many deletes, --offline, production; the
// TERYT reload's places (retired, never deleted; a rename; a new place
// without a zone; too many retired: scripts/lib/place-review.ts); and a
// rollback of the snapshot. Empties and writes DATABASE_URL, so it refuses any
// database but a local one (CI, a local container). Run after `next build`. The schedules are served from a local
// HTTP server, so the source check runs without the internet.
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { todayInWarsaw } from "../lib/dates.ts";
import { eventId } from "./lib/import-data.ts";
import { FIXTURE_IDS, fixture } from "./lib/import-fixture.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";
import { finish, searchIndexOf, startServer } from "./lib/server.mjs";

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const dir = mkdtempSync(join(tmpdir(), "conaulicy-import-"));
const served = {};
const files = createServer((request, response) => {
  const body = served[request.url.slice(1)];
  response.writeHead(body ? 200 : 404).end(body ?? "");
});
await new Promise((resolve) => files.listen(0, "127.0.0.1", resolve));
const today = todayInWarsaw();
const { etl, files: sources } = fixture(
  today,
  `http://127.0.0.1:${files.address().port}`,
);
Object.assign(served, sources);

// Ten more zoned streets, so one place retired is under the 10% limit.
const street = (sym, name, prefix = "ul.") => ({
  id: `ulic-0972447-${sym}`,
  localityId: "simc-0972447",
  teryt: sym,
  prefix,
  name,
});
const member = (sym) => ({
  localityId: "simc-0972447",
  streetId: `ulic-0972447-${sym}`,
});
const EXTRA = Array.from(
  { length: 10 },
  (_, i) => `902${String(i).padStart(2, "0")}`,
);
etl.streets.push(...EXTRA.map((sym, i) => street(sym, `Testowa ${i + 1}`)));
etl.zones[0].members.push(...EXTRA.map(member));
// A first import never adds a place without a zone: the street without one
// and the roundabout come in a sector, then leave it (a later schedule).
const zoned = structuredClone(etl);
zoned.zones[0].members.push(
  member(FIXTURE_IDS.unzonedStreet.slice(8)),
  member(FIXTURE_IDS.rondo.slice(8)),
);

// Where the import publishes the snapshot and the site reads it, and the
// "merged" review files and the issues (instead of main and GitHub).
process.env.DATASET_DIR = join(dir, "dataset");
const reviewDir = join(dir, "review");
mkdirSync(reviewDir);
process.env.IMPORT_REVIEW_DIR = reviewDir;
process.env.ISSUES_FILE = join(dir, "issues.json");
const reviewFile = join(reviewDir, "teryt", "places.yaml");

const write = (data) => {
  for (const [name, rows] of Object.entries(data))
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows));
};
write(etl);

// The server gets the secret; an import run only with SITE_URL, so no run
// ever revalidates etl/sources.yaml's site.url (production).
const REVALIDATE_SECRET = "check-import";
process.env.REVALIDATE_SECRET = REVALIDATE_SECRET;
const server = await startServer(3304);
delete process.env.REVALIDATE_SECRET;

// Async, so the event loop notices when the server closes an idle socket.
const exec = (command, args, env = {}) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { env: { ...process.env, ...env } },
      (error, stdout, stderr) =>
        resolve({ code: error ? (error.code ?? 1) : 0, out: stdout + stderr }),
    );
  });
const expectRun = async (label, args, code, pattern, env) => {
  const { code: got, out } = await exec(
    process.execPath,
    ["scripts/import.ts", "--from", dir, ...args],
    env,
  );
  check(
    got === code && pattern.test(out),
    `${label}: exit ${got} (want ${code}), output does not match ${pattern}\n${out}`,
  );
};
const page = async (path) => {
  const response = await fetch(`${server.origin}${path}`);
  return { status: response.status, text: await response.text() };
};

try {
  // Start empty, as a first real import does (children first).
  const db = new pg.Client({ connectionString: localDatabaseUrl() });
  await db.connect();
  for (const table of [
    "events",
    "zone_members",
    "zones",
    "streets",
    "localities",
    "gminy",
    "meta",
  ])
    await db.query(`delete from ${table}`);
  await db.end();
  // Read Asnyka once, so the cache holds what the import must replace (its
  // waste subpage: the smoke check reads it).
  await page(`/adres/${FIXTURE_IDS.asnyka}`);
  await page(`/adres/${FIXTURE_IDS.asnyka}/smieci`);

  write(zoned);
  await expectRun("production guard", ["--apply"], 1, /--yes-production/, {
    VERCEL_ENV: "production",
  });
  await expectRun(
    "offline apply",
    ["--apply", "--offline"],
    1,
    /dry runs only/,
  );
  // New places wait for their merged review.
  await expectRun(
    "unreviewed places",
    ["--apply"],
    1,
    /No merged etl\/review\/teryt\/places\.yaml/,
  );
  await expectRun(
    "dry run",
    ["--review", reviewFile],
    0,
    /Diff against the database:[\s\S]*Places: \+17 new[\s\S]*Places' review written[\s\S]*Dry run: nothing written/,
  );
  await expectRun(
    "first apply",
    ["--apply"],
    0,
    /Imported: 12 events[\s\S]*Dataset snapshot published[\s\S]*Revalidate ok[\s\S]*Smoke check ok/,
    { SITE_URL: server.origin, REVALIDATE_SECRET },
  );
  await expectRun("re-run", [], 0, /events\s+\+0\s+−0\s+~0/);
  // The street and the roundabout leave their sector: places unchanged.
  write(etl);
  await expectRun(
    "zones only",
    ["--apply"],
    0,
    /Places: \+0 new, 0 retired[\s\S]*Imported: 12 events[\s\S]*Revalidate ok/,
    { SITE_URL: server.origin, REVALIDATE_SECRET },
  );

  // Pages read the import (after the revalidate above).
  // The waste subpages: the calendar and the source line are there, by
  // their markup, never their words.
  const part = await page(`/adres/${FIXTURE_IDS.villagePart}/smieci`);
  check(
    part.status === 200 &&
      part.text.includes("Dąbrowa (Basznia Górna, gm. Lubaczów)") &&
      /<a href="\/ics\/[^"]+" role="button"/.test(part.text) &&
      part.text.includes('<details class="govuk-details">'),
    "village part: no label with its village, no zone from its village, or no calendar help",
  );
  // Its source note (components/subpage-parts.tsx SourceNote, t373): the
  // inset, the source line with a link per source (here the check
  // server's own files, so http), then the check on its own line, its day
  // unbroken (a no-break space before the month).
  const village = await page(`/adres/${FIXTURE_IDS.village}/smieci`);
  check(
    village.status === 200 &&
      /<div class="govuk-inset-text"><p class="govuk-body-s app-quiet[^"]*">(?:[^<]+<a href="https?:\/\/[^"]+" class="govuk-link">[^<]+<\/a>)+[^<]*<\/p><p class="govuk-body-s app-quiet">[^<]*\d{1,2}\u00a0\p{L}+[^<]*<\/p><\/div>/u.test(
        village.text,
      ),
    "village: no source line (its link out, then its check)",
  );
  const unzoned = await page(`/adres/${FIXTURE_IDS.unzonedStreet}`);
  // Its notice in the inset, with a link out to the gmina's schedule.
  check(
    /<div class="govuk-inset-text">(?:(?!<\/div>)[\s\S])*<a [^>]*href="https:\/\//.test(
      unzoned.text,
    ),
    "street without a zone: no link to the town's schedule",
  );
  const rondo = await page(`/adres/${FIXTURE_IDS.rondo}`);
  check(rondo.status === 200, "rondo: direct link does not work");
  const hits = async (q) =>
    (await fetch(`${server.origin}/api/search?q=${q}`)).json();
  check((await hits("rondo")).length === 0, "rondo: still offered in search");
  const dabrowa = (await hits("dabrowa")).map((h) => h.label).sort();
  check(
    JSON.stringify(dabrowa) ===
      JSON.stringify([
        "Dąbrowa (Basznia Górna, gm. Lubaczów)",
        "Dąbrowa (gm. Lubaczów)",
      ]),
    `search "dabrowa": ${JSON.stringify(dabrowa)}`,
  );
  // The search field's index holds the same places as /api/search.
  const home = await page("/");
  const { url: indexUrl, places: index } = await searchIndexOf(
    server.origin,
    home.text,
  );
  const labels = index.map(([, label]) => label);
  check(
    labels.includes("Dąbrowa (Basznia Górna, gm. Lubaczów)") &&
      !labels.some((label) => label.startsWith("rondo")),
    `search index: ${indexUrl ?? "no URL on /"}, ${index.length} places`,
  );
  const pdf = await fetch(
    `${server.origin}/adres/${FIXTURE_IDS.villagePart}/harmonogram.pdf`,
  );
  check(
    pdf.status === 200 &&
      pdf.headers.get("content-type")?.startsWith("application/pdf"),
    `PDF for the village part: HTTP ${pdf.status}`,
  );

  // A small change: one event gone, one relabelled. Upsert, no seed path.
  const changed = structuredClone(etl);
  changed.events.pop();
  changed.events[0].label = "Zmieszane (zmiana)";
  write(changed);
  await expectRun(
    "update",
    ["--apply"],
    0,
    /events\s+\+0\s+−1\s+~1[\s\S]*Imported: 11 events/,
  );

  // Losing over 10% of a table needs --allow-deletes.
  const shrunk = structuredClone(changed);
  shrunk.events = shrunk.events.slice(0, 6);
  write(shrunk);
  await expectRun("delete guard", ["--apply"], 1, /--allow-deletes/);
  await expectRun(
    "allowed deletes",
    ["--apply", "--allow-deletes"],
    0,
    /Imported: 6 events/,
  );

  // A schedule that changed since the ETL read it stops the import.
  const doc = Object.keys(sources)[0];
  served[doc] = `${sources[doc]}zmiana\n`;
  write(etl);
  await expectRun(
    "changed source",
    ["--apply"],
    1,
    /Source check failed; nothing written/,
  );
  served[doc] = sources[doc];

  // A dataset that fails validation is never applied.
  const broken = structuredClone(etl);
  broken.events[0].id = eventId("waste:miasto-s1", "inne", today);
  write(broken);
  await expectRun("invalid dataset", ["--apply"], 1, /Invalid dataset/);

  // The TERYT reload: places are retired, never deleted, as reviewed.
  const rows = async (sql, params) => {
    const client = new pg.Client({ connectionString: localDatabaseUrl() });
    await client.connect();
    try {
      return (await client.query(sql, params)).rows;
    } finally {
      await client.end();
    }
  };
  const placeRow = async (id) =>
    (
      await rows(
        "select id, retired_at, replaced_by from streets where id = $1",
        [id],
      )
    )[0];
  const reviewed = async (label, data) => {
    write(data);
    await expectRun(
      `${label}: dry run`,
      ["--review", reviewFile],
      0,
      /Places' review written/,
    );
    await expectRun(
      `${label}: apply`,
      ["--apply"],
      0,
      /Imported:[\s\S]*Revalidate ok/,
      {
        SITE_URL: server.origin,
        REVALIDATE_SECRET,
      },
    );
  };
  const gone = "0972447-90209";
  const retire = structuredClone(etl);
  retire.streets = retire.streets.filter((s) => s.id !== `ulic-${gone}`);
  retire.zones[0].members = retire.zones[0].members.filter(
    (m) => m.streetId !== `ulic-${gone}`,
  );
  await reviewed("retire", retire);
  const retired = await placeRow(gone);
  check(
    retired?.retired_at && retired.replaced_by === null,
    `retire: ${gone} deleted or not retired: ${JSON.stringify(retired)}`,
  );
  // Its address stays: a page of its own (its h1 not the 404's), with
  // the way back to the search.
  const h1 = (html) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? null;
  const gonePage = await page(`/adres/${gone}`);
  const notFound = await page("/404");
  check(
    gonePage.status === 200 &&
      h1(gonePage.text) !== null &&
      h1(gonePage.text) !== h1(notFound.text),
    `retire: /adres/${gone} is no page of its own (HTTP ${gonePage.status})`,
  );

  const [from, to] = ["0972447-90208", "0972447-90299"];
  const rename = structuredClone(retire);
  for (const s of rename.streets)
    if (s.id === `ulic-${from}`)
      Object.assign(s, { id: `ulic-${to}`, teryt: "90299" });
  for (const m of rename.zones[0].members)
    if (m.streetId === `ulic-${from}`) m.streetId = `ulic-${to}`;
  await reviewed("rename", rename);
  const renamed = await placeRow(from);
  check(
    renamed?.retired_at && renamed.replaced_by === to,
    `rename: ${from} not retired with replaced_by ${to}: ${JSON.stringify(renamed)}`,
  );
  const map = await (await fetch(`${server.origin}/api/places`)).json();
  check(
    map.moved?.[from] === to && map.ids.includes(gone),
    `rename: /api/places moved ${JSON.stringify(map.moved)}, retired id listed: ${map.ids?.includes(gone)}`,
  );

  const lost = structuredClone(rename);
  lost.streets.push(street("90300", "Nowa"));
  write(lost);
  await expectRun(
    "new place without a zone",
    ["--apply"],
    1,
    /has no waste zone/,
  );
  check(
    !(await placeRow("0972447-90300")) &&
      readFileSync(process.env.ISSUES_FILE, "utf8").includes("teryt-unzoned"),
    "new place without a zone: written, or no issue",
  );

  const mass = structuredClone(rename);
  const dropped = ["90200", "90201", "90202"].map(
    (sym) => `ulic-0972447-${sym}`,
  );
  mass.streets = mass.streets.filter((s) => !dropped.includes(s.id));
  mass.zones[0].members = mass.zones[0].members.filter(
    (m) => !dropped.includes(m.streetId),
  );
  write(mass);
  await expectRun("mass retire", ["--apply"], 1, /--allow-mass-retire/);
  check(
    (
      await rows(
        "select count(*)::int as n from streets where retired_at is null and id = any($1)",
        [dropped.map((id) => id.slice(5))],
      )
    )[0].n === 3,
    "mass retire: places retired anyway",
  );

  // Every snapshot is kept; a rollback moves only the pointer.
  const versions = readdirSync(join(process.env.DATASET_DIR, "dataset/v"));
  const pointer = () =>
    JSON.parse(
      readFileSync(
        join(process.env.DATASET_DIR, "dataset/current.json"),
        "utf8",
      ),
    );
  const before = pointer();
  const back = await exec(
    process.execPath,
    ["scripts/dataset.ts", "rollback", "--to", before.previous],
    { SITE_URL: server.origin, REVALIDATE_SECRET },
  );
  check(
    versions.length >= 3 &&
      back.code === 0 &&
      pointer().version === before.previous &&
      existsSync(join(process.env.DATASET_DIR, before.path)),
    `rollback: ${versions.length} versions, exit ${back.code}\n${back.out}`,
  );
} finally {
  server.stop();
  files.close();
  rmSync(dir, { recursive: true, force: true });
}

finish(
  failures,
  "Importer: dry run, apply, update, guards, TERYT places and the snapshot ok.",
);
