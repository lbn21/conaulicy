// Checks the street PDFs (app/adres/[id]/harmonogram.pdf) of every address
// the CI fixture has (lib/dataset-fixture.ts: each waste zone's members, a split street
// with a number in its part), never a list of ours.
// Each must be a tagged PDF (MarkInfo, Lang, structure tree) with no PDF/UA
// claim (it fails veraPDF), within the size budget, with only Atkinson
// Hyperlegible Next embedded, and exactly two pages: the calendar, then the
// guide from the gmina's own rules. Every address's month
// tables are the same size, rows included, in one fixed 3 × 2 grid inside
// the page's margins (every month of the six with dates on page 1), every
// row one height (no date's marks wrap), every header cell's text one
// padding in, the band's QR box and caption ink ending on the right margin
// (both pages, from a 288 dpi render; needs pdftoppm), each page's footer rule at one place (its fine print in rows
// reserved for the longest: page 1's unverified note shown or not, page 2
// every source of the gmina's guide, each linked), the key one grid under
// its own heading (the same rows and
// columns on every address's PDF: equal, margin to margin; one entry per
// mark, no two of one colour token), all at one
// place on the page whatever the street's name (the longest on one line),
// and so are the guide's tiles; no word on pages 1–2 spills
// out of its table, tile or box (scripts/lib/pdf-layout.mjs). Checks are
// structural (pages, links, QR codes, boxes, sources from data), never the
// wording (CLAUDE.md, Workflow). A split street without a number has
// no PDF (404), as on the street page; nor has a street whose schedule has
// ended, and its page offers neither the PDF nor the calendar file. The PDF,
// ICS and search responses carry the dataset cache tag, and no other, so
// an import's revalidate purges their CDN copies; so does every address
// route's shell (hub, each subpage), cached until then
// (cacheLife "max"). No cron purges anything. The QR codes, read back from the pages,
// and every link open the waste subpage on SITE_URL. Run after
// `next build`; needs poppler-utils (pdfinfo, pdffonts, pdftotext).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import { SITE_URL } from "../lib/config.generated.ts";
import { fixtureDataset } from "../lib/dataset-fixture.ts";
import { todayInWarsaw } from "../lib/dates.ts";
import { fileSlug } from "../lib/normalize.ts";
import { MONTH_DAYS, TABLE_ROW } from "../lib/pdf-grid.ts";
import { PDF_MONTHS } from "../lib/pdf-key.ts";
import { GUIDES } from "../lib/sorting-guide.ts";
import { FRACTIONS, TOKEN } from "../lib/waste-bin.ts";
import { walk } from "./lib/files.mjs";
import { pageStrokes, pageWords, spills } from "./lib/pdf-layout.mjs";
import { finish, startServer } from "./lib/server.mjs";

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_BYTES = 150_000;
// Page 1 the calendar and its key, page 2 „Co wrzucać”: two pages, every
// address.
const PAGES = 2;

// Every address the CI fixture has, from the dataset the built site shows
// (lib/dataset-fixture.ts, the rows scripts/ci-fixture.ts writes; CI's
// build has no snapshot), never a list of ours: each waste zone's members,
// a split street's part with a number in it (and without one: a 404), and
// each zone's window months with dates; a zone with none left (an ended
// schedule) is a 404 too.
function fixtureCases() {
  const today = todayInWarsaw();
  const ds = fixtureDataset(today);
  const zones = new Map(ds.zones.map((z) => [z.id, z]));
  const localities = new Map(ds.localities.map((l) => [l.id, l]));
  const streets = new Map(ds.streets.map((s) => [s.id, s]));
  const gminy = new Map(ds.gminy.map((g) => [g.id, g]));
  // By zone, locality, street, first number; none last, as SQL's ORDER BY.
  const key = (v) => (v === null ? "\uffff" : v);
  const members = ds.zoneMembers
    .filter((m) => zones.get(m.zoneId)?.type === "waste")
    .map((m) => ({
      zone_id: m.zoneId,
      locality_id: m.localityId,
      street_id: m.streetId,
      house_from: m.houseFrom,
      parity: m.parity,
      zone_name: zones.get(m.zoneId).name,
      name:
        (m.streetId && streets.get(m.streetId)?.name) ??
        localities.get(m.localityId).name,
      gmina: gminy.get(localities.get(m.localityId).gminaId).name,
    }))
    .sort((a, b) => {
      for (const k of ["zone_id", "locality_id", "street_id", "house_from"]) {
        const [x, y] = [key(a[k]), key(b[k])];
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    });
  const months = [
    ...Map.groupBy(
      ds.events.filter((e) => e.type === "waste"),
      (e) => e.zoneId,
    ),
  ].map(([zone_id, events]) => ({
    zone_id,
    months: [...new Set(events.map((e) => e.start.slice(0, 7)))],
    last: events
      .map((e) => e.start)
      .sort()
      .at(-1),
  }));
  const window = Array.from({ length: PDF_MONTHS }, (_, i) => {
    const n =
      Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
  const byZone = new Map(months.map((r) => [r.zone_id, r]));
  const cases = [];
  const seen = new Set();
  for (const m of members) {
    const id = m.street_id ?? m.locality_id;
    const split = m.house_from !== null || m.parity !== null;
    const nr = !split
      ? null
      : (m.house_from ?? (m.parity === "odd" ? "1" : "2"));
    const query = nr ? `?nr=${nr}` : "";
    const zone = byZone.get(m.zone_id);
    const live = Boolean(zone && zone.last >= today);
    const add = (c) => {
      if (seen.has(c.path)) return;
      seen.add(c.path);
      cases.push(c);
    };
    add({
      name: `${id}${query}`,
      path: `/adres/${id}/harmonogram.pdf${query}`,
      page: `/adres/${id}/smieci${query}`,
      id,
      zoneId: m.zone_id,
      zoneName: m.zone_name,
      placeName: m.name,
      gmina: m.gmina,
      months: live
        ? window.filter((key) => zone.months.includes(key)).length
        : 0,
      status: live ? 200 : 404,
    });
    if (split) {
      add({
        name: `${id} (no number)`,
        path: `/adres/${id}/harmonogram.pdf`,
        status: 404,
      });
    }
  }
  // The longest place name among the PDFs: on one line of page 1.
  const named = cases.filter((c) => c.status === 200);
  const longest = named.reduce((a, b) =>
    b.placeName.length > a.placeName.length ? b : a,
  );
  longest.title = true;
  return cases;
}
const CASES = fixtureCases();
const LIVE = CASES.filter((c) => c.status === 200);
const ENDED = CASES.find((c) => c.status === 404 && c.page);
check(LIVE.length > 0, "the fixture has no address with a PDF");
check(Boolean(ENDED), "the fixture has no ended schedule");
// Responses the CDN keeps (when the gate is off), tagged DATASET alone, the
// import's purge, the only one (lib/headers.ts); the ended schedule's PDF
// is a 404. A live address, its zone's calendar file, an ended one, a search.
const sample = LIVE[0];
const TAGGED = [
  sample.path,
  `/ics/${encodeURIComponent(sample.zoneId)}`,
  `/adres/${sample.id}/woda.ics`,
  ...(ENDED ? [ENDED.path] : []),
  `/api/search?q=${encodeURIComponent(sample.placeName.split(" ").at(-1).toLowerCase())}`,
];
// Every address route's shell (its ISR entry's tags, Next's
// x-next-cache-tags, each page's own entry in .next/server): tagged
// DATASET, so an import's purge reaches each one, the only way a shell
// cached with cacheLife "max" changes before the next deploy.
const PAGE_TAGS = ["", "/smieci", "/woda", "/prad"].map(
  (sub) => `/adres/${sample.id}${sub}`,
);

// The tags of the ISR entry `next start` wrote for a page, found by its
// path's implicit tag; written just after the response, so polled.
async function pageTags(pagePath) {
  const own = `_N_T_${pagePath}`;
  for (let i = 0; i < 50; i++) {
    for (const file of walk(
      path.join(ROOT, ".next/server"),
      (name) => name === "chunks",
    )) {
      if (!file.endsWith(".meta")) continue;
      let tags;
      try {
        tags = JSON.parse(readFileSync(file, "utf8")).headers?.[
          "x-next-cache-tags"
        ];
      } catch {
        continue;
      }
      const list = typeof tags === "string" ? tags.split(",") : [];
      if (list.includes(own)) return list;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

// A table, tile or box: a stroked rectangle at least this large (the guide's
// icons are smaller); a word may reach this far past its box's line.
const MIN_BOX = { w: 50, h: 40 };
const SPILL = 1;
const PAGE_H = 841.89;
const PAGE_W = 595.28;
// The page's side margin (the route's MARGIN): every table inside it.
const SIDE = 28;
/** The band's height (the route's bandH, 37 U) and the gap under it and
 * between the grid's rows (GRID_GAP, 8 U). */
const BAND_H = 148;
const GRID_GAP = 32;
/** A mark's slot on page 1 (route.ts MARK): a glyph mark is narrower. */
const MARK_SLOT = 11;
// Page 1's fixed month grid (the route's MONTH_COLUMNS × MONTH_ROWS).
const GRID = { columns: 3, rows: 2 };
const round = (n) => Math.round(n * 100) / 100;
// Per case: page 1's table size and row height, page 2's largest tile.
const layouts = [];
// Per case: page 1's key, its heading's line, its rows and columns.
const keys = [];
// Every address's tables' positions: together, one 3 × 2 grid.
const gridXs = new Set();
const gridYs = new Set();
/** A key row and the gap between its cells (the route's KEY_ROW, KEY_GAP). */
const KEY_ROW = 20;
const KEY_GAP = 12;
/** A key label's start in its cell: its mark's slot and a step. */
const KEY_LABEL_IN = MARK_SLOT + 4;
/** Every fraction's name (FRACTIONS) → its colour token: its key mark. */
const TOKEN_OF_LABEL = new Map(
  FRACTIONS.map(({ subtype, label }) => [label, TOKEN[subtype]]),
);

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });
// The raw file plus every stream that inflates, so compressed metadata counts.
function pdfSource(bytes) {
  const raw = bytes.toString("latin1");
  const parts = [raw];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {}
  }
  return parts.join("\n");
}

// The QR codes' modules, read back from the drawing: one square per dark
// module ("x y w h re", w = h = cell + 0.05); each code's modules share one
// size, and two codes of one size (the waste subpage's on page 1, the
// gmina's full rules on page 2) lie apart: more than a quiet zone (4
// modules) between their rows.
function qrCodes(source) {
  const squares = [
    ...source.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re\b/g),
  ]
    .map((m) => m.slice(1, 5).map(Number))
    .filter(([, , w, h]) => w === h);
  return [...Map.groupBy(squares, ([, , w]) => w)]
    .flatMap(([w, cells]) => {
      const sorted = [...cells].sort((a, b) => a[1] - b[1]);
      const codes = [];
      for (const square of sorted) {
        const last = codes.at(-1);
        if (last && square[1] - last.at(-1)[1] <= 4 * w) last.push(square);
        else codes.push([square]);
      }
      return codes.map((code) => [w, code]);
    })
    .filter(([, cells]) => cells.length >= 100)
    .map(([w, cells]) => {
      const cell = w - 0.05;
      const x0 = Math.min(...cells.map(([x]) => x));
      const y0 = Math.min(...cells.map(([, y]) => y));
      const size = Math.round(
        (Math.max(...cells.map(([x]) => x)) - x0) / cell + 1,
      );
      const grid = new Uint8Array(size * size);
      for (const [x, y] of cells) {
        grid[Math.round((y - y0) / cell) * size + Math.round((x - x0) / cell)] =
          1;
      }
      return { size, grid };
    });
}

// Whether one of the drawn codes is exactly the code for url.
function qrEncodes(codes, url) {
  const want = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  return codes.some(
    (modules) =>
      modules.size === want.size &&
      modules.grid.every((dark, i) => dark === want.data[i]),
  );
}

// The right edges, in points, of the white ink in the band's right half on
// page n: one per run of rows with ink (the QR box, then its caption),
// read from a 288 dpi greyscale render, each edge to a sub-pixel by its
// last pixel's coverage between the band's colour and white.
const BAND_DPI = 288;
function bandRightEdges(file, n) {
  const scale = BAND_DPI / 72;
  const out = path.join(dir, `band-${n}`);
  run("pdftoppm", [
    ...["-f", String(n), "-l", String(n), "-r", String(BAND_DPI)],
    ...["-gray", "-singlefile", "-H", String(Math.round(160 * scale))],
    file,
    out,
  ]);
  const pgm = readFileSync(`${out}.pgm`);
  const head = pgm
    .toString("latin1", 0, 64)
    .match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
  const [w, h] = [Number(head[1]), Number(head[2])];
  const at = (x, y) => pgm[head[0].length + y * w + x];
  // The band's colour: its top right corner, clear of the page's last,
  // part-covered column.
  const right = w - 3;
  const bg = at(right, 1);
  const half = Math.floor(w / 2);
  const rows = [];
  for (let y = 0; y < h; y++) {
    if (at(right, y) !== bg) break; // below the band
    let edge = null;
    for (let x = right; x >= half; x--) {
      const v = at(x, y);
      if (v > bg + (255 - bg) * 0.05) {
        edge = x + Math.min(1, (v - bg) / (255 - bg));
        break;
      }
    }
    rows.push(edge);
  }
  const runs = [];
  let last = null;
  rows.forEach((edge, y) => {
    if (edge === null) return;
    if (last === null || y - last > 1) runs.push([]);
    runs.at(-1).push(edge);
    last = y;
  });
  // A run of a few rows only is anti-aliasing, not ink.
  return runs.filter((r) => r.length > 2).map((r) => Math.max(...r) / scale);
}

const dir = mkdtempSync(path.join(tmpdir(), "check-pdf-"));
const server = await startServer(3308);
try {
  for (const c of CASES) {
    const response = await fetch(server.origin + c.path);
    const expected = c.status ?? 200;
    check(
      response.status === expected,
      `${c.name}: HTTP ${response.status}, expected ${expected}`,
    );
    if (expected !== 200 || response.status !== 200) {
      console.log(`ok    ${c.name}: HTTP ${response.status}`);
      continue;
    }
    check(
      response.headers.get("content-type") === "application/pdf",
      `${c.name}: not application/pdf`,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = path.join(dir, `${c.name.replace(/\W+/g, "-")}.pdf`);
    writeFileSync(file, bytes);

    const info = run("pdfinfo", [file]);
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    check(pages === PAGES, `${c.name}: ${pages} pages (expected ${PAGES})`);
    check(/^Tagged:\s+yes/m.test(info), `${c.name}: not a tagged PDF`);
    const source = pdfSource(bytes);
    check(
      /\/MarkInfo\b/.test(source) && /\/Marked\s+true/.test(source),
      `${c.name}: no /MarkInfo Marked true`,
    );
    check(/\/Lang\s*\(pl-PL\)/.test(source), `${c.name}: no /Lang pl-PL`);
    check(/\/StructTreeRoot\b/.test(source), `${c.name}: no structure tree`);
    check(
      !/pdfuaid/i.test(source),
      `${c.name}: claims PDF/UA (pdfuaid) but fails veraPDF`,
    );
    check(
      bytes.length <= MAX_BYTES,
      `${c.name}: ${bytes.length} B (budget ${MAX_BYTES} B)`,
    );

    // pdffonts: two header lines, then one font per line ("name type ... emb ...").
    const fonts = run("pdffonts", [file]).split("\n").slice(2).filter(Boolean);
    const names = fonts.map((line) =>
      line.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, ""),
    );
    check(
      names.length > 0 &&
        names.every((n) => /^AtkinsonHyperlegibleNext-(Regular|Bold)$/.test(n)),
      `${c.name}: fonts ${names.join(", ")} (Atkinson Hyperlegible Next only)`,
    );
    // Each row ends "emb sub uni object gen": emb is fifth from the end.
    check(
      fonts.every((line) => line.trim().split(/\s+/).at(-5) === "yes"),
      `${c.name}: a font is not embedded`,
    );

    const text = run("pdftotext", ["-layout", file, "-"]);
    const flat = text.replace(/\s+/g, " ");
    const gmina = c.gmina;
    // The QR code and the printed link: the waste subpage, never the hub or
    // a preview deployment.
    const page = SITE_URL + c.page;
    check(
      qrEncodes(qrCodes(source), page),
      `${c.name}: the QR code does not open ${page}`,
    );
    const links = [...source.matchAll(/\/URI \((https:[^)]*)\)/g)]
      .map((m) => m[1])
      .filter((uri) => uri.startsWith(SITE_URL));
    check(
      links.length > 0 && links.every((uri) => uri === page),
      `${c.name}: links ${links.join(", ")}, expected ${page} only`,
    );
    // The calendar is page 1 and „Co wrzucać” page 2, each one page: the
    // gmina's guide (lib/sorting-guide.ts, its publisher) is named on page 2
    // only, neither page prints a URL (their QR codes carry the links), the
    // guide's QR code opens its full rules. No other gmina's source appears
    // anywhere.
    const pageText = (n) =>
      run("pdftotext", ["-f", String(n), "-l", String(n), file, "-"]).replace(
        /\s+/g,
        " ",
      );
    const guide = GUIDES[gmina];
    check(Boolean(guide), `${c.name}: no segregation guide for ${gmina}`);
    const own = guide?.sources.map((source) => source.url) ?? [];
    const full = guide?.sources.find((s) => s.id === guide.fullRules)?.url;
    const others = Object.entries(GUIDES)
      .filter(([name]) => name !== gmina)
      .flatMap(([, g]) => g.sources.map((source) => source.url));
    check(
      !pageText(1).includes(guide?.publisher) &&
        pageText(2).includes(guide?.publisher),
      `${c.name}: the calendar is not one page followed by the guide`,
    );
    check(
      ![1, 2].some((n) => /https?:\/\//.test(pageText(n))),
      `${c.name}: page 1 or 2 prints a URL`,
    );
    check(
      Boolean(full) && qrEncodes(qrCodes(source), full),
      `${c.name}: no QR code to ${gmina}'s full rules (${full})`,
    );

    // The band's QR unit, on both pages: the white box's right edge and its
    // caption ink's right edge both on the right margin (Jakub, t363).
    for (const n of [1, 2]) {
      const edges = bandRightEdges(file, n);
      check(
        edges.length === 2 &&
          edges.every((x) => Math.abs(x - (PAGE_W - SIDE)) <= 0.5),
        `${c.name}: page ${n}: the QR box and caption end at ${edges.map((x) => x.toFixed(2)).join(", ")} pt (expected ${PAGE_W - SIDE} both)`,
      );
    }

    // The drawn layout: no word spills out of its table, tile or box on
    // pages 1–2; page 1's tables are all one size, rows of one height.
    const strokes = pageStrokes(bytes, PAGE_H);
    const boxesOn = (n) =>
      (strokes[n - 1]?.rects ?? []).filter(
        (r) => r.x1 - r.x0 >= MIN_BOX.w && r.y1 - r.y0 >= MIN_BOX.h,
      );
    for (const n of [1, 2]) {
      const spilled = spills(pageWords(file, n), boxesOn(n), SPILL);
      check(
        spilled.length === 0,
        `${c.name}: page ${n}: ${spilled.length} words spill out of their box (first at ${spilled[0]?.x0.toFixed(1)}, ${spilled[0]?.y0.toFixed(1)})`,
      );
    }
    const tables = boxesOn(1);
    const sizes = new Set(
      tables.map((t) => `${round(t.x1 - t.x0)}×${round(t.y1 - t.y0)}`),
    );
    // Every row of every table, border to border: one height, so no
    // date's marks wrap onto a second line (that date's row would be two).
    const rows = new Set(
      tables.flatMap((t) => {
        const ys = [
          t.y0,
          ...(strokes[0]?.rules ?? [])
            .filter(
              (r) =>
                r.x0 >= t.x0 - 0.1 &&
                r.x1 <= t.x1 + 0.1 &&
                r.y > t.y0 + 0.1 &&
                r.y < t.y1 - 0.1,
            )
            .map((r) => r.y),
          t.y1,
        ].sort((a, b) => a - b);
        return ys.slice(1).map((y, i) => round(y - ys[i]));
      }),
    );
    // The date column: a table's left border to the rule inside it.
    const splits = new Set(
      tables.map((t) => {
        const inside = (strokes[0]?.columns ?? []).find(
          (r) => r.x > t.x0 + 0.1 && r.x < t.x1 - 0.1 && r.y1 > t.y0,
        );
        return inside ? round(inside.x - t.x0) : null;
      }),
    );
    check(
      tables.length > 0 &&
        sizes.size === 1 &&
        rows.size === 1 &&
        splits.size === 1 &&
        !splits.has(null),
      `${c.name}: page 1 tables ${[...sizes].join(", ")}, rows ${[...rows].join(", ")}, date columns ${[...splits].join(", ")} (one size, every row one height: no marks wrap)`,
    );
    // Every header's text the same distance in from its cell's left edge:
    // the date header from the table's border, the marks' from the rule
    // (±1 pt for the glyphs' own side bearings).
    const words1 = pageWords(file, 1);
    const rowH = [...rows][0] ?? 0;
    // The fixed geometry, absolute, never grown by the data: every table
    // its title and header rows and MONTH_DAYS body rows of TABLE_ROW; the
    // grid GRID_GAP under the band and GRID_GAP between its rows; nothing
    // drawn in the row's height under a table (a date past the bounds:
    // the route refuses it, lib/pdf-grid.ts beyondBounds).
    const tableH = (MONTH_DAYS + 2) * TABLE_ROW;
    const tops = [...new Set(tables.map((t) => round(t.y0)))].sort(
      (a, b) => a - b,
    );
    const gaps = [
      tops[0] - BAND_H,
      ...tops.slice(1).map((y, i) => y - (tops[i] + tableH)),
    ];
    check(
      tables.length > 0 &&
        tables.every((t) => Math.abs(t.y1 - t.y0 - tableH) <= 0.5) &&
        gaps.every((gap) => Math.abs(gap - GRID_GAP) <= 0.5),
      `${c.name}: page 1 tables ${[...sizes].join(", ")} (each ${tableH} pt tall), gaps ${gaps.map(round).join(", ")} pt (each ${GRID_GAP})`,
    );
    const under = words1.filter((w) =>
      tables.some(
        (t) =>
          (w.x0 + w.x1) / 2 > t.x0 &&
          (w.x0 + w.x1) / 2 < t.x1 &&
          (w.y0 + w.y1) / 2 > t.y1 &&
          (w.y0 + w.y1) / 2 < t.y1 + TABLE_ROW,
      ),
    );
    check(
      under.length === 0,
      `${c.name}: page 1: ${under.length} words under a table (a row past ${MONTH_DAYS} dates)`,
    );
    const headerPads = tables.flatMap((t) => {
      const split = (strokes[0]?.columns ?? []).find(
        (r) => r.x > t.x0 + 0.1 && r.x < t.x1 - 0.1 && r.y1 > t.y0,
      );
      const head = words1
        .filter((w) => {
          const cy = (w.y0 + w.y1) / 2;
          return (
            cy > t.y0 + rowH &&
            cy < t.y0 + 2 * rowH &&
            w.x0 > t.x0 &&
            w.x1 < t.x1
          );
        })
        .sort((a, b) => a.x0 - b.x0);
      const after = head.find((w) => split && w.x0 > split.x);
      return split && head[0] && after
        ? [head[0].x0 - t.x0, after.x0 - split.x]
        : [Number.NaN];
    });
    check(
      headerPads.length > 0 &&
        headerPads.every(
          (pad) => Math.abs(pad - headerPads[0]) <= 1 && pad > 1,
        ),
      `${c.name}: page 1 header cells' left padding ${[...new Set(headerPads.map(round))].join(", ")} pt (one for every header cell)`,
    );
    // The key, between the tables and the footer's rule: its heading at
    // the margin on a line of its own but for a moved date's note
    // right-aligned (only where the data has one), then its fixed grid,
    // rows filled in turn, left to right (lib/pdf-key.ts). Lines 5 U
    // apart. Items are words more than 2 U apart (a mark between them).
    const tablesEnd = Math.max(...tables.map((t) => t.y1));
    const footerRule = Math.min(
      ...(strokes[0]?.rules ?? [])
        .filter((r) => r.y > tablesEnd && r.x1 - r.x0 > PAGE_W / 2)
        .map((r) => r.y),
    );
    const keyLines = [];
    for (const w of words1
      .filter((w) => w.y0 > tablesEnd && w.y1 < footerRule)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      // One line: tops within 2 U (pdftotext boxes lowercase-only words
      // lower).
      const line = keyLines.find((l) => Math.abs(l[0].y0 - w.y0) < 8);
      if (line) line.push(w);
      else keyLines.push([w]);
    }
    const blocks = [];
    for (const line of keyLines) {
      const last = blocks.at(-1);
      if (last && line[0].y0 - last.at(-1)[0].y0 < KEY_ROW + 2) last.push(line);
      else blocks.push([line]);
    }
    const keyBlock = blocks.at(-1) ?? [];
    const itemsOf = (line) =>
      [...line]
        .sort((a, b) => a.x0 - b.x0)
        .reduce((out, w) => {
          const prev = out.at(-1);
          if (prev && w.x0 - prev.x1 <= 8) {
            // A mark drawn as a glyph reads as a word before its label:
            // the item starts at the label.
            if (prev.mark) {
              prev.start = w.x0;
              prev.text = w.text;
            } else prev.text += ` ${w.text}`;
            prev.mark = false;
            prev.x1 = w.x1;
          } else {
            out.push({
              start: w.x0,
              x1: w.x1,
              mark: w.x1 - w.x0 < MARK_SLOT,
              text: w.text,
            });
          }
          return out;
        }, []);
    const heading = keyBlock[0] ? itemsOf(keyBlock[0]) : [];
    const cellRows = keyBlock.slice(1).map(itemsOf);
    const counts = cellRows.map((r) => r.length);
    check(
      heading.length >= 1 &&
        heading.length <= 2 &&
        Math.abs(heading[0].start - SIDE) < 1 &&
        (heading.length === 1 ||
          Math.abs(heading[1].x1 - (PAGE_W - SIDE)) < 2) &&
        blocks.length === 1 &&
        cellRows.length >= 1 &&
        counts.every(
          (n, i) => n <= counts[0] && (i === 0 || counts[i - 1] === counts[0]),
        ),
      `${c.name}: page 1 key: heading at the margin (${heading.length > 1 ? "a moved date's note right-aligned" : "alone"}), then ${counts.join(" + ")} items in ${cellRows.length} rows (filled in turn)`,
    );
    // One entry per mark: each entry a fraction's name (FRACTIONS), and no
    // two of one colour token (a mark is its token's: route.ts MARKS),
    // fractions sharing a token named once (lib/pdf-key.ts KEY_TOKENS).
    const entries = cellRows.flat().map((item) => item.text);
    const entryTokens = entries.map((text) => TOKEN_OF_LABEL.get(text));
    const sharing = entries.filter(
      (_, i) => entryTokens.indexOf(entryTokens[i]) !== i,
    );
    check(
      entryTokens.every(Boolean) && sharing.length === 0,
      `${c.name}: page 1 key: ${entries.length} entries, ${new Set(entryTokens).size} marks${entryTokens.every(Boolean) ? "" : ` (unknown: ${entries.filter((_, i) => !entryTokens[i]).join(", ")})`}${sharing.length ? ` (a mark twice: ${sharing.join(", ")})` : ""} (one entry per mark)`,
    );
    keys.push({
      name: c.name,
      items: counts.reduce((a, b) => a + b, 0),
      top: round(keyBlock[0]?.[0].y0 ?? Number.NaN),
      rows: keyBlock.slice(1).map((line) => round(line[0].y0)),
      x: (cellRows[0] ?? []).map((item) => round(item.start)),
      // Every later row's items in the first's columns.
      aligned: cellRows.every((r) =>
        r.every((item, i) => Math.abs(item.start - cellRows[0][i].start) < 1),
      ),
      tablesEnd: round(tablesEnd),
      footerRule: round(footerRule),
    });
    // A fixed grid inside the page's margins: at most 3 × 2 tables on page
    // 1, every month of the window with dates, nothing carried over.
    const xs = new Set(tables.map((t) => round(t.x0)));
    const ys = new Set(tables.map((t) => round(t.y0)));
    check(
      tables.every((t) => t.x0 >= SIDE - 0.1 && t.x1 <= PAGE_W - SIDE + 0.1) &&
        xs.size <= GRID.columns &&
        ys.size <= GRID.rows &&
        (tables.length < GRID.columns * GRID.rows ||
          (xs.size === GRID.columns && ys.size === GRID.rows)),
      `${c.name}: page 1 grid ${xs.size} × ${ys.size} of ${tables.length} tables, x ${[...xs].join(", ")} (a fixed ${GRID.columns} × ${GRID.rows} inside the margins)`,
    );
    check(
      tables.length === c.months,
      `${c.name}: page 1 holds ${tables.length} months, the window ${c.months} with dates`,
    );
    for (const t of tables) {
      gridXs.add(round(t.x0));
      gridYs.add(round(t.y0));
    }
    // The place's name (the document title's last part, before the
    // locality) on one line of page 1.
    if (c.title) {
      const name = info
        .match(/^Title:\s+(.*)$/m)?.[1]
        .split(" – ")
        .at(-1)
        ?.split(", ")[0];
      const lines = run("pdftotext", [
        "-f",
        "1",
        "-l",
        "1",
        "-layout",
        file,
        "-",
      ])
        .split("\n")
        .map((line) => line.trim());
      check(
        Boolean(name) && lines.some((line) => line.startsWith(name)),
        `${c.name}: the street's name is not on one line of page 1`,
      );
    }
    const tiles = boxesOn(2).sort(
      (a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0),
    );
    layouts.push({
      name: c.name,
      table: [...sizes][0],
      row: [...rows][0],
      top: round(Math.min(...tables.map((t) => t.y0))),
      date: [...splits][0],
      tile: tiles[0]
        ? `${round(tiles[0].x1 - tiles[0].x0)}×${round(tiles[0].y1 - tiles[0].y0)}`
        : null,
      // Each page's footer rule: its block reserved for the longest it can
      // be (the unverified note's row on page 1, shown or not).
      foot: [0, 1]
        .map((n) =>
          round(
            Math.max(
              ...(strokes[n]?.rules ?? [])
                .filter((r) => r.x1 - r.x0 > PAGE_W / 2)
                .map((r) => r.y),
            ),
          ),
        )
        .join(" / "),
    });
    const guideUris = [...source.matchAll(/\/URI \((https:[^)]*)\)/g)]
      .map((m) => m[1])
      .filter((uri) => own.includes(uri) || others.includes(uri));
    check(
      own.every((uri) => guideUris.includes(uri)) &&
        guideUris.every((uri) => own.includes(uri)),
      `${c.name}: guide links ${guideUris.join(", ")}, expected every one of ${gmina}'s sources and no other`,
    );
    check(
      !others.some((u) => flat.replace(/\s+/g, "").includes(u)),
      `${c.name}: cites another gmina's segregation source`,
    );
    console.log(
      `ok    ${c.name}: ${pages} pages, ${(bytes.length / 1000).toFixed(1)} KB, fonts ${[...new Set(names)].join(", ")}`,
    );
  }

  // One layout for every address, however many months it has.
  for (const key of ["table", "date", "row", "top", "tile", "foot"]) {
    const seen = new Set(layouts.map((l) => l[key]));
    check(
      seen.size === 1 && !seen.has(null),
      `${key}: ${layouts.map((l) => `${l.name} ${l[key]}`).join("; ")} (the same for every address)`,
    );
  }
  console.log(
    `ok    one layout: tables ${layouts[0]?.table} from ${layouts[0]?.top} pt, date column ${layouts[0]?.date} pt, rows ${layouts[0]?.row} pt, tiles ${layouts[0]?.tile}, footer rules ${layouts[0]?.foot} pt`,
  );

  // One key for every address, at one place: its heading's line, and its
  // rows and columns' x (so one cell width) the fullest key's, an address
  // with fewer items in the first of its cells. The fullest key's columns
  // equal, from margin to margin when it fills a row.
  const worst = keys.reduce((a, b) => (b.items > a.items ? b : a), keys[0]);
  const prefix = (xs, of) => xs.every((x, i) => Math.abs(x - of[i]) < 1);
  const pitches = (worst?.x ?? []).slice(1).map((x, i) => x - worst.x[i]);
  check(
    Boolean(worst) &&
      pitches.every((d) => Math.abs(d - pitches[0]) < 0.5) &&
      Math.abs(worst.x[0] - KEY_LABEL_IN - SIDE) < 1 &&
      (worst.rows.length < 2 ||
        Math.abs(
          worst.x.at(-1) -
            KEY_LABEL_IN +
            pitches[0] -
            KEY_GAP -
            (PAGE_W - SIDE),
        ) < 1),
    `key: the fullest (${worst?.name}) in ${worst?.rows.length} rows of ${worst?.x.length} columns, ${pitches.map(round).join(", ")} pt apart (equal, margin to margin)`,
  );
  // Every address's tables in one grid of 3 × 2 places.
  check(
    gridXs.size === GRID.columns && gridYs.size === GRID.rows,
    `month grid: tables at x ${[...gridXs].join(", ")}, y ${[...gridYs].join(", ")} (one ${GRID.columns} × ${GRID.rows} grid for every address)`,
  );
  for (const k of keys) {
    check(
      k.aligned &&
        k.top === worst.top &&
        prefix(k.rows, worst.rows) &&
        prefix(k.x, worst.x),
      `${k.name}: key heading at ${k.top}, rows at ${k.rows.join(", ")}, columns at ${k.x.join(", ")}; ${worst.name} (the fullest, ${worst.items} items): ${worst.top}, ${worst.rows.join(", ")}, ${worst.x.join(", ")} (one grid for every address)`,
    );
  }
  const pitch = worst ? round(worst.x[1] - worst.x[0]) : Number.NaN;
  console.log(
    `ok    one key: heading at ${worst?.top} pt, rows at ${worst?.rows.join(", ")} pt, columns at ${worst?.x.join(", ")} pt (a cell and its gap ${pitch} pt; fullest ${worst?.name}, ${worst?.items} items); tables end at ${keys.map((k) => `${k.name} ${k.tablesEnd}`).join("; ")}; footer rule ${worst?.footerRule} pt`,
  );

  // The waste subpage of an ended schedule (the page that offers both) has
  // no dead PDF link and no empty calendar file.
  const ended = await (await fetch(`${server.origin}${ENDED.page}`)).text();
  check(
    // Links only: the RSC payload names the sibling route harmonogram.pdf.
    !/href="[^"]*harmonogram\.pdf/.test(ended) &&
      !ended.includes('href="/ics/'),
    "schedule ended: the page still offers the PDF or the calendar file",
  );
  console.log("ok    schedule ended: page without PDF or calendar file");

  for (const p of TAGGED) {
    const response = await fetch(server.origin + p);
    await response.arrayBuffer();
    check(
      response.headers.get("vercel-cache-tag") === "dataset",
      `${p}: Vercel-Cache-Tag ${response.headers.get("vercel-cache-tag")}, expected dataset`,
    );
  }
  for (const p of PAGE_TAGS) {
    await (await fetch(server.origin + p)).text();
    const tags = await pageTags(p);
    check(
      tags?.includes("dataset") &&
        !tags.some((tag) => ["day", "water", "imgw"].includes(tag)),
      `${p}: cache tags ${tags?.join(",") ?? "(no entry)"}, expected dataset alone`,
    );
  }
  // The waste calendar's file is named after the calendar, not the zone id.
  const icsPath = `/ics/${encodeURIComponent(sample.zoneId)}`;
  const ics = await fetch(`${server.origin}${icsPath}`);
  await ics.arrayBuffer();
  const disposition = ics.headers.get("content-disposition");
  const zoneSlug = fileSlug(sample.zoneName);
  const idSlug = fileSlug(sample.zoneId.split(":").at(-1));
  check(
    new RegExp(`^inline; filename="[a-z0-9-]*${zoneSlug}\\.ics"$`).test(
      disposition ?? "",
    ) && !disposition.includes(idSlug),
    `${icsPath}: Content-Disposition ${disposition} (named after the zone, ${zoneSlug}, not its id)`,
  );
  console.log(
    `ok    dataset tag alone on ${TAGGED.length} responses, ${PAGE_TAGS.length} address shells`,
  );
} finally {
  server.stop();
}

finish(
  failures,
  `PDFs: tagged, no PDF/UA claim, QR code and links to the waste subpage, a one-page calendar, then a one-page guide from the gmina's own rules, one layout for every address, nothing spilling out of its box, ${PAGES} pages, ≤ ${MAX_BYTES / 1000} KB, Atkinson only, no example data.`,
);
