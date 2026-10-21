// End-to-end check of the unattended schedule import (scripts/schedules/,
// docs/import-schedules.md) on made-up schedules, never the real ones: a
// first import, a quiet day, a changed file applied automatically and
// reverted; every road to an issue instead of an apply (a broken PDF, vision
// passes that disagree or are not JSON, a date off its weekday, a new link on
// a watched page, both sites down) and each issue closed by the next clean
// run; the page fallback when the WordPress API is down; the dead-man
// switch; the due logic; a dry run. The two sites are local HTTP servers, the
// config a copy of etl/sources.yaml pointing at them (IMPORT_CONFIG), the
// vision passes mocked files, the archive a directory, GitHub issues a file,
// the clock IMPORT_NOW. Empties and writes the database, so it refuses any
// database but a local one (CI, a local container).
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { stringify } from "yaml";
import { loadConfig } from "./config.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";
import { fortnightly, gminaPdf } from "./lib/schedule-fixture.ts";
import { fold, MIASTO_ROWS } from "./schedules/lib.ts";

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const url = localDatabaseUrl();
const db = new pg.Client({ connectionString: url });
await db.connect();
const year = new Date().getUTCFullYear();
const day = `${year}-03-02`;
const NOW = `${day}T10:00:00Z`; // 11:00 in Warsaw, after the 05:00 run time
const dir = mkdtempSync(join(tmpdir(), "conaulicy-schedules-"));
const archive = join(dir, "archive");
const mock = join(dir, "agent");
const issuesFile = join(dir, "issues.json");
mkdirSync(mock);

// ------------------------------------------------------------ the two sites

const state = {
  apiDown: { gmina: false, miasto: false },
  down: false,
  hits: {},
};
const pages = { gmina: {}, miasto: {} };
const serve = (name) =>
  createServer((request, response) => {
    const { pathname, search } = new URL(request.url, "http://x");
    const path = `${pathname}${search.startsWith("?s=") ? search : ""}`;
    state.hits[`${name}${pathname}`] =
      (state.hits[`${name}${pathname}`] ?? 0) + 1;
    if (state.down || (state.apiDown[name] && pathname.startsWith("/wp-json/")))
      return response.writeHead(503).end();
    const body =
      pages[name][pathname.startsWith("/wp-json/") ? pathname : path];
    const value = typeof body === "function" ? body() : body;
    response.writeHead(value ? 200 : 404).end(value ?? "");
  });
const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const servers = { gmina: serve("gmina"), miasto: serve("miasto") };
const G = await listen(servers.gmina);
const M = await listen(servers.miasto);
const re = (base) => base.replaceAll(".", "\\.");

const postPage = `/${year}/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-${year}/`;
const pdfPath = `/wp-content/uploads/${year}/01/1_${year}_Dabrowa_Basznia.pdf`;
const cityPage = "/odbior-odpadow/harmonogram-odbioru-odpadow/";
const jpgPath = `/wp-content/uploads/${year - 1}/12/harmonogram-${year}-s1.jpg`;
let cityExtra = "";
pages.gmina["/wp-json/wp/v2/posts"] = JSON.stringify([
  {
    id: 1,
    link: `${G}${postPage}`,
    title: {
      rendered: `Harmonogram odbioru odpadów komunalnych na rok ${year}`,
    },
    content: { rendered: `<p><a href="${G}${pdfPath}">Sektor 1</a></p>` },
  },
]);
pages.gmina[postPage] =
  `<div class="the_content_wrapper"><a href="${G}${pdfPath}">Sektor 1</a></div>`;
pages.gmina["/?s=harmonogram"] =
  `<a href="${G}${postPage}">Harmonogram ${year}</a>`;
pages.miasto[cityPage] = () =>
  `<div class="entry-content"><a href="${M}${jpgPath}">Sektor 1</a>${cityExtra}<div class="evo">${Math.random()}</div></div>`;
pages.miasto["/?s=harmonogram"] = `<a href="${M}${cityPage}">Harmonogram</a>`;

let gminaVersion = 0;
let miastoVersion = 0;
const setPdf = (body) => {
  pages.gmina[pdfPath] = body;
  gminaVersion++;
  pages.gmina["/wp-json/wp/v2/media"] = JSON.stringify([
    {
      id: 10,
      modified_gmt: `${year}-01-0${gminaVersion}T10:00:00`,
      source_url: `${G}${pdfPath}`,
    },
  ]);
};
const setJpg = (passes) => {
  miastoVersion++;
  pages.miasto[jpgPath] = `JPEG ${miastoVersion}`;
  pages.miasto["/wp-json/wp/v2/media"] = JSON.stringify([
    {
      id: 20,
      modified_gmt: `${year - 1}-12-1${miastoVersion}T10:00:00`,
      source_url: `${M}${jpgPath.replace(".jpg", "-scaled.jpg")}`,
      mime_type: "image/jpeg",
      media_details: { original_image: `harmonogram-${year}-s1.jpg` },
    },
  ]);
  passes.forEach((reading, i) => {
    writeFileSync(
      join(mock, `miasto-s1-${year}.pass-${i + 1}.json`),
      typeof reading === "string" ? reading : JSON.stringify(reading),
    );
  });
};

// ------------------------------------------------------------ the config

const real = loadConfig();
const configFile = join(dir, "sources.yaml");
const writeConfig = (patch = () => {}) => {
  const [gmina, miasto] = ["gmina", "miasto"].map((id) =>
    real.sources.find((s) => s.id === id),
  );
  const config = {
    ...real,
    schedule: { ...real.schedule, enabled: true },
    import: { ...real.import, retries: { attempts: 2, backoffSeconds: 0 } },
    sources: [
      {
        ...gmina,
        page: `${G}${postPage}`,
        detect: { ...gmina.detect, site: G },
        watch: [
          {
            url: `${G}${postPage}`,
            links: `^${re(G)}/wp-content/uploads/.+\\.pdf$`,
          },
          {
            url: `${G}/?s=harmonogram`,
            links: `^${re(G)}/\\d{4}/\\d{2}/\\d{2}/harmonogram-odbioru-odpadow-komunalnych[^/]*/$`,
          },
        ],
      },
      {
        ...miasto,
        page: `${M}${cityPage}`,
        detect: { ...miasto.detect, site: M },
        watch: [
          {
            url: `${M}${cityPage}`,
            links: `^${re(M)}/wp-content/uploads/.+\\.(jpe?g|png|pdf)$`,
          },
          {
            url: `${M}/?s=harmonogram`,
            links: `^${re(M)}/[^?#]*harmonogram[^?#]*/$`,
          },
        ],
      },
    ],
  };
  patch(config);
  writeFileSync(configFile, stringify(config));
};
writeConfig();

// Mondays for the gmina, Tuesdays for the city; bulky waste once a quarter.
const quarterly = (weekday) =>
  fortnightly(year, weekday).map((m, i) => (i % 3 === 0 ? m.slice(0, 1) : []));
const gminaRows = [fortnightly(year, 1), fortnightly(year, 1, 1), quarterly(4)];
const reading = () => ({
  sector: 1,
  year,
  streets: ["Adama Asnyka", "Osiedle Testowe"],
  rows: Object.fromEntries(
    Object.keys(MIASTO_ROWS).map((row, i) => [
      row,
      i === 3 ? quarterly(5) : fortnightly(year, 2, i % 2),
    ]),
  ),
});

// ------------------------------------------------------------ database

await db.query(
  "truncate import_changes, import_runs, source_files, source_pages, events, zone_members, zones, streets, localities, gminy",
);
await db.query(
  `insert into gminy (id, teryt, name) values
     ('lubaczow-miasto', '1809011', 'Lubaczów (miasto)'), ('lubaczow-gmina', '1809042', 'Lubaczów (gmina)')`,
);
for (const [id, gmina, name, kind] of [
  ["simc-0972447", "lubaczow-miasto", "Lubaczów", "miasto"],
  ["simc-0606010", "lubaczow-gmina", "Dąbrowa", "wies"],
  ["simc-0605950", "lubaczow-gmina", "Basznia Górna", "wies"],
])
  await db.query(
    "insert into localities (id, gmina_id, teryt, name, kind, search) values ($1, $2, $3, $4, $5, $6)",
    [id, gmina, id.slice(5), name, kind, fold(name)],
  );
for (const [sym, prefix, name] of [
  ["00470", "ul.", "Adama Asnyka"],
  ["90101", "os.", "Osiedle Testowe"],
])
  await db.query(
    "insert into streets (id, locality_id, teryt, prefix, name, search) values ($1, 'simc-0972447', $2, $3, $4, $5)",
    [`ulic-0972447-${sym}`, sym, prefix, name, fold(name)],
  );
await db.query(
  `insert into zones (id, type, name) values
     ('waste:miasto-s1', 'waste', 'Miasto Lubaczów, sektor 1'), ('waste:gmina-s1', 'waste', 'Gmina Lubaczów, sektor 1')`,
);
await db.query(
  `insert into zone_members (zone_id, locality_id, street_id) values
     ('waste:miasto-s1', 'simc-0972447', 'ulic-0972447-00470'),
     ('waste:miasto-s1', 'simc-0972447', 'ulic-0972447-90101'),
     ('waste:gmina-s1', 'simc-0606010', null),
     ('waste:gmina-s1', 'simc-0605950', null)`,
);

// ------------------------------------------------------------ helpers

const env = {
  ...process.env,
  IMPORT_DATABASE_URL: url,
  IMPORT_CONFIG: configFile,
  IMPORT_NOW: NOW,
  ARCHIVE_DIR: archive,
  ISSUES_FILE: issuesFile,
  CURSOR_AGENT_MOCK: mock,
  CURSOR_API_KEY: "",
  GH_TOKEN: "",
  REVALIDATE_SECRET: "",
  ACTIONS_RUN_URL: "https://github.com/example/run/1",
};
const node = (script, args, extra = {}) =>
  new Promise((resolve) =>
    execFile(
      "node",
      ["--no-warnings", script, ...args],
      { env: { ...env, ...extra } },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (error.code ?? 1) : 0,
          out: `${stdout}${stderr}`,
        }),
    ),
  );
const run = (args = [], extra = {}) =>
  node("scripts/schedules/run.ts", args, extra);
const revert = (...args) => node("scripts/schedules/revert.ts", args);
const lastRuns = async () =>
  Object.fromEntries(
    (
      await db.query(
        "select distinct on (source) source, status, dry_run, detected_via, events_added, events_removed, events_changed, batch_id, actions_run_url from import_runs where source <> 'revert' order by source, xmin::text::bigint desc",
      )
    ).rows.map((r) => [r.source, r]),
  );
const snapshot = async () =>
  (
    await db.query(
      "select id, start, subtype, source_sha256 from events order by id",
    )
  ).rows
    .map((r) => `${r.id}|${r.start}|${r.subtype}|${r.source_sha256}`)
    .join("\n");
const issues = () =>
  existsSync(issuesFile) ? JSON.parse(readFileSync(issuesFile, "utf8")) : [];
const open = (pattern) =>
  issues().filter((i) => i.state === "open" && pattern.test(i.key));
const step = async (name, fn) => {
  const before = failures.length;
  await fn();
  console.log(`${failures.length === before ? "ok  " : "FAIL"}  ${name}`);
};

// ------------------------------------------------------------ scenarios

setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], gminaRows));
setJpg([reading(), reading()]);

await step(
  "first import: both sources applied, archived, logged, page link synced",
  async () => {
    const r = await run();
    check(r.code === 0, `first run exited ${r.code}:\n${r.out}`);
    const runs = await lastRuns();
    check(
      runs.gmina?.status === "applied",
      `gmina: ${runs.gmina?.status}\n${r.out}`,
    );
    check(
      runs.miasto?.status === "applied",
      `miasto: ${runs.miasto?.status}\n${r.out}`,
    );
    check(runs.gmina?.detected_via === "api", "detected_via is not api");
    check(
      runs.gmina?.actions_run_url === env.ACTIONS_RUN_URL,
      "import_runs has no run URL",
    );
    const n = (await db.query("select count(*)::int as n from events")).rows[0]
      .n;
    check(
      n > 100 && n === runs.gmina.events_added + runs.miasto.events_added,
      `events: ${n}`,
    );
    check(
      existsSync(
        join(archive, `sources/gmina/${day}/1_${year}_Dabrowa_Basznia.pdf`),
      ),
      "PDF not archived",
    );
    check(
      existsSync(
        join(archive, `sources/miasto/${day}/harmonogram-${year}-s1.jpg`),
      ),
      "JPG not archived",
    );
    const settled = (
      await db.query(
        "select count(*)::int as n from source_files where s3_key is not null and settled_at is not null",
      )
    ).rows[0].n;
    check(settled === 2, `settled, archived source_files: ${settled}`);
    const link = (
      await db.query(
        "select schedule_url from gminy where id = 'lubaczow-gmina'",
      )
    ).rows[0].schedule_url;
    check(
      link === `${G}${postPage}`,
      `gminy.schedule_url not synced from the config: ${link}`,
    );
    const pagesSeen = (
      await db.query("select count(*)::int as n from source_pages")
    ).rows[0].n;
    check(pagesSeen === 4, `watched pages stored: ${pagesSeen}`);
    check(issues().length === 0, `issues: ${JSON.stringify(issues())}`);
  },
);

const settled = await snapshot();
await step("next run, nothing new: no_change, nothing downloaded", async () => {
  const hits = state.hits[`gmina${pdfPath}`];
  const r = await run();
  const runs = await lastRuns();
  check(
    r.code === 0 &&
      runs.gmina?.status === "no_change" &&
      runs.miasto?.status === "no_change",
    `statuses ${runs.gmina?.status}/${runs.miasto?.status}`,
  );
  check(
    state.hits[`gmina${pdfPath}`] === hits,
    "an unchanged PDF was downloaded again",
  );
  check((await snapshot()) === settled, "events changed");
});

await step("scheduled: not before the run time, once a day", async () => {
  const early = await run(["--scheduled"], { IMPORT_NOW: `${day}T02:00:00Z` }); // 03:00 Warsaw
  check(
    early.code === 0 && /Nothing due/.test(early.out),
    `before 05:00: ${early.out}`,
  );
  const again = await run(["--scheduled"]);
  check(
    again.code === 0 && /Nothing due/.test(again.out),
    `already ran today: ${again.out}`,
  );
  const next = await run(["--scheduled"], {
    IMPORT_NOW: `${year}-03-03T10:00:00Z`,
  });
  check(
    /gmina: no_change/.test(next.out) && /miasto: no_change/.test(next.out),
    `next day: ${next.out}`,
  );
});

await step(
  "the WordPress API down: detected from the pages, logged",
  async () => {
    state.apiDown.gmina = true;
    const r = await run();
    state.apiDown.gmina = false;
    const { gmina } = await lastRuns();
    check(
      gmina?.status === "no_change" && gmina?.detected_via === "page",
      `gmina ${gmina?.status} via ${gmina?.detected_via}`,
    );
    check(
      /WordPress API unavailable/.test(r.out) &&
        /falling back to the watched pages/.test(r.out),
      "fallback not logged",
    );
  },
);

await step("a changed PDF is applied as one batch, and reverted", async () => {
  const moved = gminaRows.map((r) => r.map((m) => [...m]));
  moved[0][0][0] += 7; // the first January Monday moves a week later
  setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], moved));
  await run();
  const { gmina } = await lastRuns();
  check(
    gmina?.status === "applied" && gmina.batch_id,
    `status ${gmina?.status}`,
  );
  check(
    gmina?.events_added === 2 && gmina?.events_removed === 2,
    `+${gmina?.events_added} −${gmina?.events_removed}`,
  );
  // Every other event now cites the new file: changed, not added or removed.
  check(gmina?.events_changed > 0, "events still cite the old file");
  const logged = (
    await db.query(
      "select count(*)::int as n from import_changes where batch_id = $1",
      [gmina.batch_id],
    )
  ).rows[0].n;
  check(
    logged === gmina.events_added + gmina.events_removed + gmina.events_changed,
    `import_changes: ${logged}`,
  );
  const r = await revert(gmina.batch_id);
  check(r.code === 0, `revert exited ${r.code}: ${r.out}`);
  check(
    (await snapshot()) === settled,
    "the revert did not restore the events",
  );
  const again = await revert(gmina.batch_id);
  check(
    again.code !== 0 && /already reverted/.test(again.out),
    "a second revert was not refused",
  );
});

const beforeReview = await snapshot();
await step(
  "a broken PDF: an issue, not the database; retried; closed when fixed",
  async () => {
    setPdf(Buffer.from("%PDF-1.4 not a schedule"));
    await run();
    check(
      (await lastRuns()).gmina?.status === "needs_review",
      "not needs_review",
    );
    const opened = open(/^gmina:review:/);
    check(
      opened.length === 1 && /extraction failed/.test(opened[0].body),
      "no issue explaining the extraction",
    );
    check((await snapshot()) === beforeReview, "events changed");
    await run();
    check(
      open(/^gmina:review:/).length === 1 &&
        issues().filter((i) => i.key.startsWith("gmina:review:")).length === 1,
      `the same problem opened a second issue: ${JSON.stringify(issues().map((i) => [i.key, i.state, i.body.slice(0, 400)]))}`,
    );
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], gminaRows));
    await run();
    check(
      (await lastRuns()).gmina?.status === "no_change",
      "the fixed file did not settle",
    );
    check(
      open(/^gmina:/).length === 0,
      "the issue was not closed by the clean run",
    );
  },
);

await step("vision passes that disagree: an issue", async () => {
  const other = reading();
  other.rows.bio[5] = [...other.rows.bio[5], 30];
  setJpg([reading(), other]);
  await run();
  check(
    (await lastRuns()).miasto?.status === "needs_review",
    "not needs_review",
  );
  const issue = open(/^miasto:review:/)[0];
  check(
    issue && /disagree/.test(issue.body) && /bio, czerwiec/.test(issue.body),
    "no issue with the disagreement",
  );
  check((await snapshot()) === beforeReview, "events changed");
});

await step(
  "a pass that is not valid JSON: an issue (the earlier one closed)",
  async () => {
    setJpg([reading(), "Sorry, I cannot read this image."]);
    await run();
    const now = open(/^miasto:review:/);
    check(
      now.length === 1 && /not valid JSON/.test(now[0].body),
      "no single issue for the current problem",
    );
  },
);

await step(
  "a date off its weekday: an issue, even when both passes agree",
  async () => {
    const odd = reading();
    const march4 = new Date(Date.UTC(year, 2, 4)).getUTCDay();
    odd.rows.bio[2] = [...odd.rows.bio[2], 4 + ((8 - march4) % 7)]; // a Monday in March
    setJpg([odd, odd]);
    await run();
    check(
      open(/^miasto:review:/).some((i) => /usual weekday/.test(i.body)),
      "no issue about the weekday",
    );
    check((await snapshot()) === beforeReview, "events changed");
    setJpg([reading(), reading()]);
    await run();
    check(open(/^miasto:/).length === 0, "not closed by the clean run");
  },
);

await step(
  "prose around the JSON and a different street: dates apply, streets to review",
  async () => {
    const [one, two] = [reading(), reading()];
    one.streets = ["ul. Adama Asnyka", "os. Osiedle Testowe"];
    two.streets = ["Adama Asnyka", "Osiedle Nowe"];
    setJpg([
      `I'll read the schedule image and return only the JSON.${JSON.stringify(one)}`,
      `\`\`\`json\n${JSON.stringify(two)}\n\`\`\`\nDone.`,
    ]);
    const members = async () =>
      (await db.query("select count(*)::int as n from zone_members")).rows[0].n;
    const before = await members();
    await run();
    check(
      (await lastRuns()).miasto?.status === "applied",
      `not applied: ${(await lastRuns()).miasto?.error}`,
    );
    check((await snapshot()) !== beforeReview, "the new file was not applied");
    check((await members()) === before, "zone members changed");
    const review = () => open(/^streets:waste:miasto-s1$/);
    check(
      review().length === 1 &&
        /„Osiedle Nowe” is not a member now \(pass 2\)/.test(review()[0].body),
      `no street-review issue: ${JSON.stringify(issues().map((i) => i.key))}`,
    );
    await run();
    check(
      (await lastRuns()).miasto?.status === "no_change" &&
        review().length === 1,
      "the street-review issue was closed without a person",
    );
  },
);

await step(
  "a new link on a watched page: an issue until the config handles it",
  async () => {
    const extra = `${M}/wp-content/uploads/${year}/06/harmonogram-${year}-s1-aktualizacja.jpg`;
    cityExtra = `<a href="${extra}">Zmiana</a>`;
    await run();
    const issue = open(/^miasto:review:/)[0];
    check(issue?.body.includes(extra), "no issue naming the new link");
    writeConfig((c) => {
      c.sources[1].watch[0].ignore = [extra];
    });
    await run();
    check(
      (await lastRuns()).miasto?.status === "no_change",
      "an ignored link still blocks",
    );
    check(open(/^miasto:/).length === 0, "not closed after the config change");
  },
);

await step(
  "dry run: a good change is reported, not applied, no issue",
  async () => {
    setPdf(
      await gminaPdf(
        ["Dąbrowa", "Basznia Górna"],
        gminaRows.map((r, i) => (i === 2 ? quarterly(3) : r)),
      ),
    );
    const before = issues().length;
    const events = await snapshot();
    const r = await run(["--dry-run"]);
    const { gmina } = await lastRuns();
    check(
      r.code === 0 && gmina?.dry_run === true,
      `dry run row: ${JSON.stringify(gmina)}`,
    );
    check((await snapshot()) === events, "a dry run changed events");
    check(issues().length === before, "a dry run opened an issue");
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], gminaRows));
  },
);

await step(
  "dead-man switch: one issue while dates run out, closed when covered",
  async () => {
    const late = { IMPORT_NOW: `${year}-12-20T10:00:00Z` };
    await run([], late);
    await run([], late);
    const coverage = issues().filter((i) => i.key === "coverage");
    check(
      coverage.length === 1 && coverage[0].state === "open",
      `coverage issues: ${coverage.length}`,
    );
    check(
      /waste:gmina-s1/.test(coverage[0]?.body) &&
        /waste:miasto-s1/.test(coverage[0]?.body),
      "zones not listed",
    );
    await run();
    check(
      issues().find((i) => i.key === "coverage")?.state === "closed",
      "not closed when covered",
    );
  },
);

await step(
  "both sites down: failed, one issue per source, the job fails, then closed",
  async () => {
    state.down = true;
    const r = await run();
    const r2 = await run();
    state.down = false;
    const runs = await lastRuns();
    check(r.code !== 0 && r2.code !== 0, "the run did not fail");
    check(
      runs.gmina?.status === "failed" && runs.miasto?.status === "failed",
      "not failed",
    );
    check(
      open(/:failed:/).length === 2 &&
        issues().filter((i) => /:failed:/.test(i.key)).length === 2,
      "not exactly one issue per source",
    );
    await run();
    check(
      open(/:failed:/).length === 0,
      "failure issues not closed by the clean run",
    );
  },
);

await db.end();
for (const server of Object.values(servers)) server.close();
rmSync(dir, { recursive: true, force: true });
if (failures.length > 0) {
  console.log(`\n${failures.map((f) => `FAIL  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  "\nSchedule import: auto-apply, revert, fallback, dead-man switch, and every issue path work.",
);
