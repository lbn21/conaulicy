// End-to-end check of the unattended import (scripts/import/, its waste
// domain; docs/import.md) on made-up schedules, never the real ones: every
// new file read once by (mocked) Grok and held for its review PR, even when
// clean; a merged review applied for its sha256 only, a rejected one keeping
// the database; force_extract on a settled file opening a review too; a
// quiet day, a changed file reviewed, applied as one batch and reverted;
// what a review PR shows (a reply that is not JSON, a street not in the
// zone, a date off its weekday); every road to an issue instead of an apply
// (a broken PDF, a new link on a watched page, both sites down) and each
// issue closed by the next clean run; the page fallback when the WordPress
// API is down; the dead-man switch; a dry run and extract-only; a dropped
// database connection (retried once, else the failure path, never a crash).
// The two sites are local HTTP servers, the config a copy of
// etl/sources.yaml pointing at them (IMPORT_CONFIG), Grok's replies files
// (XAI_MOCK_DIR; every run also loads scripts/lib/no-network.mjs, so
// api.x.ai cannot be reached), the archive a directory, GitHub issues and
// review PRs files (merging one: its reviewed file into IMPORT_REVIEW_DIR),
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
import { normalize } from "../lib/normalize.ts";
import { loadConfig } from "./import/core/config.ts";
import { LAYOUT_ROWS, MONTHS } from "./import/waste/lib.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";
import { fortnightly, gminaPdf } from "./lib/schedule-fixture.ts";

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const url = localDatabaseUrl();
const db = new pg.Client({ connectionString: url });
await db.connect();
const year = new Date().getUTCFullYear();
const day = `${year}-03-02`;
const NOW = `${day}T10:00:00Z`; // 11:00 in Warsaw
const dir = mkdtempSync(join(tmpdir(), "conaulicy-schedules-"));
const archive = join(dir, "archive");
const mock = join(dir, "xai");
const issuesFile = join(dir, "issues.json");
const reviewsFile = join(dir, "reviews.json");
const reviewDir = join(dir, "review");
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
// Grok's reply for each file (XAI_MOCK_DIR/<source>-s<sector>-<year>.json).
const reply = (source, content) =>
  writeFileSync(
    join(mock, `${source}-s1-${year}.json`),
    typeof content === "string" ? content : JSON.stringify(content),
  );
const request = (source) =>
  JSON.parse(readFileSync(join(mock, `${source}-s1-${year}.request.json`)));
/** A PDF, and Grok's reading of it (by default its rows, read right). */
const setPdf = (body, rows = gminaRows) => {
  pages.gmina[pdfPath] = body;
  reply("gmina", gminaReply(rows));
  gminaVersion++;
  pages.gmina["/wp-json/wp/v2/media"] = JSON.stringify([
    {
      id: 10,
      modified_gmt: `${year}-01-0${gminaVersion}T10:00:00`,
      source_url: `${G}${pdfPath}`,
    },
  ]);
};
/** A new version of the JPG, and Grok's reply for it. */
const setJpg = (content = cityReply()) => {
  const version = ++miastoVersion;
  pages.miasto[jpgPath] = `JPEG ${version}`;
  pages.miasto["/wp-json/wp/v2/media"] = JSON.stringify([
    {
      id: 20,
      modified_gmt: `${year - 1}-12-${String(10 + version).padStart(2, "0")}T10:00:00`,
      source_url: `${M}${jpgPath.replace(".jpg", "-scaled.jpg")}`,
      mime_type: "image/jpeg",
      media_details: { original_image: `harmonogram-${year}-s1.jpg` },
    },
  ]);
  reply("miasto", content);
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
const cityRows = () =>
  Object.keys(LAYOUT_ROWS.miasto).map((_, i) =>
    i === 3 ? quarterly(5) : fortnightly(year, 2, i % 2),
  );
// Replies in the prompts' shape, as Grok would give them for these files.
const HEADERS = MONTHS.map((m) => m.toUpperCase());
const entries = (months, city) =>
  months.flatMap((days, i) =>
    days.map((day) => ({
      month: i + 1,
      month_header: HEADERS[i],
      ...(city ? { above: null } : {}),
      day,
    })),
  );
const reading = (layout, rows, places) => ({
  sector: layout === "gmina" ? null : 1,
  year,
  months: HEADERS,
  places,
  rows: Object.fromEntries(
    Object.keys(LAYOUT_ROWS[layout]).map((row, i) => [
      row,
      entries(rows[i], layout === "miasto"),
    ]),
  ),
  unplaced: [],
});
const gminaReply = (rows = gminaRows) =>
  reading("gmina", rows, [
    { as_written: "DĄBROWA", id: "0606010" },
    { as_written: "BASZNIA GÓRNA", id: "0605950" },
  ]);
const cityReply = (
  rows = cityRows(),
  places = [
    { as_written: "Adama Asnyka", id: "00470" },
    { as_written: "Cicha", id: "02974" },
  ],
) => reading("miasto", rows, places);

// ------------------------------------------------------------ database

await db.query(
  "truncate import_changes, import_runs, source_files, source_pages, events, zone_members, zones, streets, localities, gminy",
);
await db.query(
  `insert into gminy (id, teryt, name) values
     ('lubaczow-miasto', '1809011', 'Lubaczów (miasto)'), ('lubaczow-gmina', '1809042', 'Lubaczów (gmina)')`,
);
// Real TERYT ids (lib/zuk-places.generated.ts), as the database holds them.
for (const [id, gmina, name, kind] of [
  ["0972447", "lubaczow-miasto", "Lubaczów", "miasto"],
  ["0606010", "lubaczow-gmina", "Dąbrowa", "wies"],
  ["0605950", "lubaczow-gmina", "Basznia Górna", "wies"],
])
  await db.query(
    "insert into localities (id, gmina_id, teryt, name, kind, search) values ($1, $2, $3, $4, $5, $6)",
    [id, gmina, id, name, kind, normalize(name)],
  );
for (const [sym, prefix, name] of [
  ["00470", "ul.", "Adama Asnyka"],
  ["02974", "ul.", "Cicha"],
])
  await db.query(
    "insert into streets (id, locality_id, teryt, prefix, name, search) values ($1, '0972447', $2, $3, $4, $5)",
    [`0972447-${sym}`, sym, prefix, name, normalize(name)],
  );
await db.query(
  `insert into zones (id, type, name) values
     ('waste:miasto-s1', 'waste', 'Miasto Lubaczów, sektor 1'), ('waste:gmina-s1', 'waste', 'Gmina Lubaczów, sektor 1')`,
);
await db.query(
  `insert into zone_members (zone_id, locality_id, street_id) values
     ('waste:miasto-s1', '0972447', '0972447-00470'),
     ('waste:miasto-s1', '0972447', '0972447-02974'),
     ('waste:gmina-s1', '0606010', null),
     ('waste:gmina-s1', '0605950', null)`,
);

// ------------------------------------------------------------ helpers

const env = {
  ...process.env,
  IMPORT_DATABASE_URL: url,
  IMPORT_CONFIG: configFile,
  IMPORT_NOW: NOW,
  ARCHIVE_DIR: archive,
  ISSUES_FILE: issuesFile,
  REVIEWS_FILE: reviewsFile,
  IMPORT_REVIEW_DIR: reviewDir,
  XAI_MOCK_DIR: mock,
  XAI_API_KEY: "",
  // Nothing but loopback: Grok's replies come from XAI_MOCK_DIR only.
  NODE_OPTIONS: `--import=${new URL("./lib/no-network.mjs", import.meta.url).href}`,
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
  node("scripts/import/core/run.ts", args, extra);
// The server drops the connection before queries matching `query`
// (scripts/lib/drop-connection.mjs), `times` times (default: always).
const runDropping = (query, times, args = []) =>
  run(args, {
    NODE_OPTIONS: `${env.NODE_OPTIONS} --import=${new URL("./lib/drop-connection.mjs", import.meta.url).href}`,
    DROP_QUERY: query,
    DROP_TIMES: times ? String(times) : "",
  });
const revert = (...args) => node("scripts/import/core/revert.ts", args);
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
const prs = () =>
  existsSync(reviewsFile) ? JSON.parse(readFileSync(reviewsFile, "utf8")) : [];
const openPrs = () => prs().filter((p) => p.state === "open");
const savePrs = (all) => writeFileSync(reviewsFile, JSON.stringify(all));
const reviewedPath = {
  gmina: `etl/review/gmina/1_${year}_Dabrowa_Basznia.yaml`,
  miasto: `etl/review/miasto/harmonogram-${year}-s1.yaml`,
};
const openPr = (source) =>
  openPrs().find((p) => p.branch.startsWith(`import-review/${source}/`));
/** Merges (true) or closes (false) a review PR, as a person would. */
const decide = (number, merge) => {
  const all = prs();
  const pr = all.find((p) => p.number === number);
  pr.state = merge ? "merged" : "closed";
  savePrs(all);
  if (merge)
    for (const [file, content] of Object.entries(pr.files)) {
      const target = join(reviewDir, file.slice("etl/review/".length));
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, content);
    }
};
/** Merges every open review PR as it stands. */
const mergeAll = () => {
  for (const pr of openPrs()) decide(pr.number, true);
};
/** Both sources waited for their review PRs: nothing applied. */
const bothHeld = async (r) => {
  const runs = await lastRuns();
  check(
    runs.gmina?.status === "needs_review" &&
      runs.miasto?.status === "needs_review",
    `statuses ${runs.gmina?.status}/${runs.miasto?.status}\n${r.out}`,
  );
  return runs;
};
const step = async (name, fn) => {
  const before = failures.length;
  await fn();
  console.log(`${failures.length === before ? "ok  " : "FAIL"}  ${name}`);
};

// ------------------------------------------------------------ scenarios

// The first January Monday a week later: the PDF's second version.
const moved = gminaRows.map((r) => r.map((m) => [...m]));
moved[0][0][0] += 7;

setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], gminaRows));
setJpg();

await step(
  "first sight: each file read once, a blocking review PR, nothing applied",
  async () => {
    const r = await run();
    check(r.code === 0, `first run exited ${r.code}:\n${r.out}`);
    const runs = await bothHeld(r);
    check(runs.gmina?.detected_via === "api", "detected_via is not api");
    check(
      runs.gmina?.actions_run_url === env.ACTIONS_RUN_URL,
      "import_runs has no run URL",
    );
    const n = (await db.query("select count(*)::int as n from events")).rows[0]
      .n;
    check(n === 0, `events applied before any review: ${n}`);
    const [gmina, miasto] = [openPr("gmina"), openPr("miasto")];
    check(
      openPrs().length === 2 &&
        /nowy harmonogram do sprawdzenia/.test(gmina?.title) &&
        /nowy harmonogram do sprawdzenia/.test(miasto?.title) &&
        gmina?.body.includes("- wszystkie przeszły") &&
        miasto?.body.includes("- wszystkie przeszły") &&
        miasto?.body.includes(
          `[![harmonogram-${year}-s1.jpg](${M}${jpgPath})](${M}${jpgPath})`,
        ) &&
        !miasto?.body.includes("Uwaga:") &&
        miasto?.branch === `import-review/miasto/harmonogram-${year}-s1`,
      `not one clean, blocking review PR per file: ${JSON.stringify(prs().map((p) => [p.title, p.body.slice(0, 300)]))}`,
    );
    // The review PRs are the notice (no dates yet: the dead-man switch's
    // coverage issue is right).
    check(
      open(/^(gmina|miasto):/).length === 0,
      `issues: ${JSON.stringify(issues())}`,
    );
    // One request each: the prompt, then the image (gmina rendered to PNG).
    for (const [source, mime] of [
      ["gmina", "image/png"],
      ["miasto", "image/jpeg"],
    ]) {
      const body = request(source);
      const [text, image] = body.messages[0].content;
      check(
        body.model === "grok-4.7" &&
          body.reasoning_effort === "medium" &&
          body.messages.length === 1 &&
          !("temperature" in body) &&
          !("response_format" in body) &&
          text.type === "text" &&
          image.image_url.detail === "high" &&
          image.image_url.url.startsWith(`data:${mime};base64,`),
        `${source}: not the dry run's request: ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    check(
      existsSync(
        join(archive, `sources/gmina/${day}/1_${year}_Dabrowa_Basznia.pdf`),
      ) &&
        existsSync(
          join(archive, `sources/miasto/${day}/harmonogram-${year}-s1.jpg`),
        ),
      "files not archived",
    );
    const settled = (
      await db.query(
        "select count(*)::int as n from source_files where settled_at is not null",
      )
    ).rows[0].n;
    check(settled === 0, `settled before a review: ${settled}`);
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
  },
);

await step(
  "the next run, reviews still open: no xAI call, the PRs untouched, nothing applied",
  async () => {
    const before = JSON.stringify(prs());
    for (const source of ["gmina", "miasto"])
      rmSync(join(mock, `${source}-s1-${year}.request.json`));
    await bothHeld(await run());
    check(
      ["gmina", "miasto"].every(
        (source) =>
          !existsSync(join(mock, `${source}-s1-${year}.request.json`)),
      ),
      "a file with an open review was read again",
    );
    check(JSON.stringify(prs()) === before, "an open review PR was changed");
  },
);

await step(
  "merged reviews: their dates applied, archived, settled, logged",
  async () => {
    mergeAll();
    const r = await run();
    const runs = await lastRuns();
    check(
      runs.gmina?.status === "applied" && runs.miasto?.status === "applied",
      `statuses ${runs.gmina?.status}/${runs.miasto?.status}\n${r.out}`,
    );
    check(
      /dates from its merged review/.test(r.out),
      "the merged review was not used",
    );
    const n = (await db.query("select count(*)::int as n from events")).rows[0]
      .n;
    check(
      n > 100 && n === runs.gmina.events_added + runs.miasto.events_added,
      `events: ${n}`,
    );
    const settled = (
      await db.query(
        "select count(*)::int as n from source_files where s3_key is not null and settled_at is not null",
      )
    ).rows[0].n;
    check(settled === 2, `settled, archived source_files: ${settled}`);
    check(
      openPrs().length === 0 && prs().length === 2,
      "a review PR was opened again",
    );
    check(
      open(/./).length === 0 &&
        issues().every((i) => i.key === "coverage:waste"),
      `issues: ${JSON.stringify(issues())}`,
    );
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

await step(
  "force_extract on settled files: read again, a review PR each, nothing applied",
  async () => {
    // As for a file imported before this import was automated: settled,
    // with no review of its own anywhere.
    savePrs([]);
    rmSync(reviewDir, { recursive: true, force: true });
    await bothHeld(await run(["--force-extract"]));
    check(
      openPrs().length === 2 &&
        openPrs().every((p) => !p.body.includes("**różnica**")),
      `no review PR per file, or a difference shown: ${JSON.stringify(openPrs().map((p) => p.title))}`,
    );
    check((await snapshot()) === settled, "events changed");
    // Merged: the next force_extract uses them, no call, no new PR.
    mergeAll();
    await run(["--force-extract"]);
    const after = await lastRuns();
    check(
      after.gmina?.status === "no_change" &&
        after.miasto?.status === "no_change" &&
        prs().length === 2 &&
        openPrs().length === 0,
      `with merged reviews: ${after.gmina?.status}/${after.miasto?.status}, PRs ${prs().length}`,
    );
  },
);

await step(
  "a changed PDF: a review PR, then applied as one batch, and reverted",
  async () => {
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], moved), moved);
    await run();
    check(
      (await lastRuns()).gmina?.status === "needs_review" &&
        (await snapshot()) === settled,
      "applied before its review",
    );
    const pr = openPr("gmina");
    check(
      /\| zmieszane\+bio \| styczeń \| STYCZEŃ \| [\d, ]+ \| [\d, ]+ \| \*\*różnica\*\* \|/.test(
        pr?.body,
      ),
      `the review does not show the moved date: ${pr?.body}`,
    );
    decide(pr.number, true);
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
      logged ===
        gmina.events_added + gmina.events_removed + gmina.events_changed,
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
  },
);

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
      opened.length === 1 &&
        /extraction failed: pdftoppm cannot render it/.test(opened[0].body),
      `no issue explaining the extraction: ${JSON.stringify(opened)}`,
    );
    check((await snapshot()) === settled, "events changed");
    await run();
    check(
      open(/^gmina:review:/).length === 1 &&
        issues().filter((i) => i.key.startsWith("gmina:review:")).length === 1,
      `the same problem opened a second issue: ${JSON.stringify(issues().map((i) => [i.key, i.state, i.body.slice(0, 400)]))}`,
    );
    // The second version again: reviewed and settled, nothing to do.
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], moved), moved);
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

await step(
  "the review PR shows what Grok read: a reply that is not JSON, then a street not in the zone",
  async () => {
    const before = await snapshot();
    const count = prs().length;
    const prose = `I'll read the schedule.${JSON.stringify(cityReply())}`;
    setJpg(prose);
    await run();
    check(
      (await lastRuns()).miasto?.status === "needs_review",
      "not needs_review",
    );
    check(open(/^miasto:/).length === 0, "an issue was opened too");
    let pr = openPr("miasto");
    check(
      prs().length === count + 1 &&
        pr?.body.includes("- reply is not JSON") &&
        pr?.body.includes(`~~~~~~\n${prose}\n~~~~~~`) &&
        pr?.files[reviewedPath.miasto].includes("daty do wpisania"),
      `the PR does not show the reply: ${pr?.body}`,
    );
    const members = async () =>
      (await db.query("select count(*)::int as n from zone_members")).rows[0].n;
    const memberCount = await members();
    // A new version of the file (its own read, the same PR updated), now
    // with 3-go Maja (listed, not in the zone) instead of Cicha, and one name
    // it gave no id.
    setJpg(
      cityReply(cityRows(), [
        { as_written: "Adama Asnyka", id: "00470" },
        { as_written: "3-go Maja", id: "29830" },
        { as_written: "Os. Nowe", id: null },
      ]),
    );
    await run();
    pr = openPr("miasto");
    check(
      prs().length === count + 1 &&
        pr?.body.includes(
          "**Na pliku, nie w tej strefie w bazie:**\n\n- „3-go Maja” (id 29830)",
        ) &&
        pr?.body.includes(
          "**W tej strefie w bazie, nie na pliku:**\n\n- Cicha (id 02974)",
        ) &&
        pr?.body.includes("**Bez id (null):**\n\n- „Os. Nowe” (id null)") &&
        pr?.body.includes("- wszystkie przeszły"),
      `the street lists are not in the one PR: ${pr?.body}`,
    );
    check((await members()) === memberCount, "zone members changed");
    check((await snapshot()) === before, "events changed");
  },
);

await step(
  "a rejected review: the database keeps its dates, no new PR",
  async () => {
    const before = await snapshot();
    const count = prs().length;
    decide(openPr("miasto").number, false);
    await run();
    check(
      (await lastRuns()).miasto?.status === "no_change",
      `status: ${(await lastRuns()).miasto?.status}`,
    );
    check((await snapshot()) === before, "events changed");
    check(
      openPrs().length === 0 && prs().length === count,
      "a rejected review was opened again",
    );
    check(open(/^miasto:/).length === 0, "an issue was opened");
  },
);

await step(
  "a date off its weekday: shown in the review PR; merged, an issue until approved",
  async () => {
    const odd = cityRows();
    const march4 = new Date(Date.UTC(year, 2, 4)).getUTCDay();
    odd[2][2] = [...odd[2][2], 4 + ((8 - march4) % 7)].sort((a, b) => a - b); // a Monday in March
    setJpg(cityReply(odd));
    await run();
    const pr = openPr("miasto");
    check(
      /### Reguły dat\n\n- waste:miasto-s1: \S+ \(bio\) is not on the row's usual weekday/.test(
        pr?.body,
      ),
      `the review does not show the weekday: ${pr?.body}`,
    );
    decide(pr.number, true);
    await run();
    check(
      open(/^miasto:review:/).some((i) => /usual weekday/.test(i.body)),
      "no issue about the weekday",
    );
    check((await snapshot()) === settled, "events changed");
    // A corrected version, reviewed and merged: applied, the issue closed.
    setJpg(cityReply());
    await run();
    mergeAll();
    await run();
    check(
      (await lastRuns()).miasto?.status === "applied" &&
        open(/^miasto:/).length === 0,
      `not applied and closed: ${(await lastRuns()).miasto?.status}`,
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
  "dry run and extract-only: a new PDF gets its review PR from the dry run only; superseded by a reviewed version",
  async () => {
    const bulky = gminaRows.map((r, i) => (i === 2 ? quarterly(3) : r));
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], bulky), bulky);
    const before = issues().length;
    const events = await snapshot();
    const count = prs().length;
    // extract-only first: once the dry run opens its review, the file is
    // not read again.
    const only = await run(["--extract-only"]);
    check(
      only.code === 0 && /All files extracted/.test(only.out),
      `extract-only on clean readings:\n${only.out}`,
    );
    check(prs().length === count, "extract-only opened a review PR");
    reply("gmina", "Sorry, I cannot read this image.");
    const bad = await run(["--extract-only"]);
    check(
      bad.code === 1 && /reply is not JSON/.test(bad.out),
      `extract-only did not report the reply:\n${bad.out}`,
    );
    reply("gmina", gminaReply(bulky));
    const dry = await run(["--dry-run"]);
    const { gmina } = await lastRuns();
    check(
      dry.code === 0 && gmina?.dry_run === true,
      `dry run row: ${JSON.stringify(gmina)}`,
    );
    check(
      prs().length === count + 1 && openPr("gmina"),
      "the dry run opened no review PR",
    );
    check((await snapshot()) === events, "a dry run changed events");
    check(issues().length === before, "a dry run opened an issue");
    const after = JSON.stringify(prs());
    await run(["--extract-only"]);
    check(JSON.stringify(prs()) === after, "extract-only touched a review PR");
    // The site goes back to the reviewed second version: read through its
    // merged review (force_extract, as it is settled), the open review of
    // the other version closed.
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], moved), moved);
    await run(["--force-extract"]);
    check(
      openPrs().length === 0 && prs().length === count + 1,
      "the review of the other version was not superseded",
    );
    check(
      (await lastRuns()).gmina?.status === "applied",
      `the reviewed version was not applied: ${(await lastRuns()).gmina?.status}`,
    );
  },
);

await step(
  "dead-man switch: one issue while dates run out, closed when covered",
  async () => {
    const late = { IMPORT_NOW: `${year}-12-20T10:00:00Z` };
    await run([], late);
    await run([], late);
    // Open, once (the first run's, before any dates, is closed).
    const coverage = open(/^coverage:waste$/);
    check(coverage.length === 1, `open coverage issues: ${coverage.length}`);
    check(
      /waste:gmina-s1/.test(coverage[0]?.body) &&
        /waste:miasto-s1/.test(coverage[0]?.body),
      "zones not listed",
    );
    await run();
    check(open(/^coverage:waste$/).length === 0, "not closed when covered");
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

const crashed = (out) => /Unhandled 'error' event|node:events/.test(out);

await step(
  "a dropped connection: reconnected, the query retried once, the run completes",
  async () => {
    // Both files have merged reviews: force_extract uses them, no PR.
    const r = await runDropping("from zones where id", 1, ["--force-extract"]);
    const runs = await lastRuns();
    check(
      r.code === 0 && !crashed(r.out),
      `exited ${r.code} after one drop:\n${r.out}`,
    );
    check(
      /reconnecting and retrying once/.test(r.out),
      "the drop was not retried",
    );
    check(
      runs.gmina?.status === "no_change" && runs.miasto?.status === "no_change",
      `statuses: ${runs.gmina?.status}, ${runs.miasto?.status}`,
    );
  },
);

await step(
  "a connection that keeps dropping: each source fails with a row and an issue, no crash",
  async () => {
    const r = await runDropping("from zones where id", 0, ["--force-extract"]);
    const runs = await lastRuns();
    check(r.code === 1 && !crashed(r.out), `exited ${r.code}:\n${r.out}`);
    check(
      runs.gmina?.status === "failed" && runs.miasto?.status === "failed",
      `statuses: ${runs.gmina?.status}, ${runs.miasto?.status}`,
    );
    check(open(/:failed:/).length === 2, "not one failure issue per source");
    await run();
    check(open(/:failed:/).length === 0, "not closed by the clean run");
  },
);

await step(
  "a drop inside the apply: the transaction is lost, nothing half-applied, applied next run",
  async () => {
    const bulky = gminaRows.map((r, i) => (i === 2 ? quarterly(2) : r));
    setPdf(await gminaPdf(["Dąbrowa", "Basznia Górna"], bulky), bulky);
    await run();
    decide(openPr("gmina").number, true);
    const events = await snapshot();
    const r = await runDropping("insert into import_changes", 1);
    check(r.code === 1 && !crashed(r.out), `exited ${r.code}:\n${r.out}`);
    check(
      (await lastRuns()).gmina?.status === "failed",
      "the lost transaction did not fail the source",
    );
    check((await snapshot()) === events, "events half-applied");
    await run();
    check(
      (await lastRuns()).gmina?.status === "applied" &&
        open(/:failed:/).length === 0,
      "not applied (and closed) by the next run",
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
  "\nSchedule import: always reviewed, merged reviews applied, revert, fallback, dead-man switch, and every issue path work.",
);
