// End-to-end check of the importer on a made-up dataset (never the real one):
// an empty database, dry run, a first --apply, then the pages read the
// imported data. Also the guards: changed sources, too many deletes,
// --offline, production. Empties and writes DATABASE_URL, so it refuses any
// database but a local one (CI, a local container). Run after `next build`. The schedules are served from a local
// HTTP server, so the source check runs without the internet.
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
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
  // Read Asnyka once, so the cache holds what the import must replace.
  await page(`/adres/${FIXTURE_IDS.asnyka}`);

  await expectRun("production guard", ["--apply"], 1, /--yes-production/, {
    VERCEL_ENV: "production",
  });
  await expectRun(
    "offline apply",
    ["--apply", "--offline"],
    1,
    /dry runs only/,
  );
  await expectRun(
    "dry run",
    [],
    0,
    /Diff against the database:[\s\S]*Dry run: nothing written/,
  );
  await expectRun(
    "first apply",
    ["--apply"],
    0,
    /Imported: 12 events[\s\S]*Revalidate ok[\s\S]*Smoke check ok/,
    { SITE_URL: server.origin, REVALIDATE_SECRET },
  );
  await expectRun("re-run", [], 0, /events\s+\+0\s+−0\s+~0/);

  // Pages read the import (after the revalidate above).
  const part = await page(`/adres/${FIXTURE_IDS.villagePart}`);
  check(
    part.status === 200 &&
      part.text.includes("Dąbrowa (Basznia Górna, gm. Lubaczów)") &&
      part.text.includes("Dodaj do kalendarza"),
    "village part: no label with its village, or no zone from its village",
  );
  const village = await page(`/adres/${FIXTURE_IDS.village}`);
  check(
    village.status === 200 &&
      village.text.includes("Harmonogram") &&
      village.text.includes("Stan na"),
    "village: no source line",
  );
  const unzoned = await page(`/adres/${FIXTURE_IDS.unzonedStreet}`);
  check(
    unzoned.text.includes("Tej ulicy jeszcze nie mamy") &&
      unzoned.text.includes(
        "Otwórz harmonogram Urzędu Miejskiego w Lubaczowie",
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
  const indexUrl = home.text.match(/\/api\/search-index\/[0-9a-f]+/)?.[0];
  const index = indexUrl
    ? await (await fetch(`${server.origin}${indexUrl}`)).json()
    : [];
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
} finally {
  server.stop();
  files.close();
  rmSync(dir, { recursive: true, force: true });
}

finish(failures, "Importer: dry run, apply, update and guards ok.");
