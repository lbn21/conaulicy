// End-to-end check of the importer on a made-up dataset (never the real one):
// an empty database, dry run, a first --apply (its places reviewed first),
// then the dataset snapshot it publishes (DATASET_DIR, scripts/lib/dataset.ts)
// holds the imported data, as the site's views read it. Also the
// guards: changed sources, too many deletes, --offline, production; the
// TERYT reload's places (retired, never deleted; a rename; a new place
// without a zone; too many retired: scripts/lib/place-review.ts); and a
// rollback of the snapshot; every publish's decision on the built site
// (POST /api/revalidate: the made-up build's place set is never the
// import's, so the Deploy Hook, never a revalidation). Empties and writes
// DATABASE_URL, so it refuses any
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
import { parseDataset } from "../lib/dataset-schema.ts";
import { placeIdsOf, placeView, searchIndexOf } from "../lib/dataset-views.ts";
import { todayInWarsaw } from "../lib/dates.ts";
import { eventId } from "./lib/import-data.ts";
import { FIXTURE_IDS, fixture } from "./lib/import-fixture.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";
import { finish, startServer } from "./lib/server.mjs";

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const dir = mkdtempSync(join(tmpdir(), "conaulicy-import-"));
const served = {};
// Also the site's Deploy Hook: the made-up build's place set is never the
// import's, so every publish asks for a new deployment (lib/dataset-sync.ts).
let hooks = 0;
const files = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/hook") {
    hooks++;
    response.writeHead(201).end("{}");
    return;
  }
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
process.env.DEPLOY_HOOK_URL = `http://127.0.0.1:${files.address().port}/hook`;
const server = await startServer(3304);
delete process.env.REVALIDATE_SECRET;
delete process.env.DEPLOY_HOOK_URL;

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
// The snapshot the import published last (DATASET_DIR), as the site would
// read it: the pages are the build's, a new place set a new deployment.
const published = () => {
  const store = process.env.DATASET_DIR;
  const pointer = JSON.parse(
    readFileSync(join(store, "dataset/current.json"), "utf8"),
  );
  return parseDataset(readFileSync(join(store, pointer.path), "utf8"));
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
    /Imported: 12 events[\s\S]*Dataset snapshot published[\s\S]*Revalidate ok: \{[^}]*"deploy"[\s\S]*Smoke check skipped/,
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

  // Every publish asked for a new deployment (the place set is never the
  // made-up build's): nothing revalidated, the hook called.
  check(hooks >= 2, `deploy hook: ${hooks} calls, want one per publish`);
  // The snapshot holds the import (the site's views over it,
  // lib/dataset-views.ts), by structure.
  const snapshot = published();
  const part = placeView(snapshot, FIXTURE_IDS.villagePart, today);
  check(
    part?.label === "Dąbrowa (Basznia Górna, gm. Lubaczów)" &&
      part.zoneId !== null,
    "village part: no label with its village, or no zone from its village",
  );
  check(
    placeView(snapshot, FIXTURE_IDS.rondo, today) !== null,
    "rondo: no page of its own",
  );
  const labels = searchIndexOf(snapshot).places.map(([, label]) => label);
  check(
    labels.includes("Dąbrowa (Basznia Górna, gm. Lubaczów)") &&
      labels.includes("Dąbrowa (gm. Lubaczów)") &&
      !labels.some((label) => label.startsWith("rondo")),
    `search index: ${labels.length} places`,
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
  // No page of its own any more (the next deployment's 404): not among
  // the snapshot's places, and no redirect.
  const afterRetire = published();
  check(
    !placeIdsOf(afterRetire).includes(gone) && !afterRetire.redirects[gone],
    `retire: ${gone} still a place, or redirected`,
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
  const afterRename = published();
  check(
    afterRename.redirects[from] === to &&
      !placeIdsOf(afterRename).includes(from),
    `rename: redirects ${JSON.stringify(afterRename.redirects)}`,
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
