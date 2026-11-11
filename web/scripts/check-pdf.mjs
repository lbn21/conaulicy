// Checks the street PDFs (app/adres/[id]/harmonogram.pdf) on the CI fixture: a
// city street over twelve months, one with two, a village, and a split street
// with ?nr=.
// Each must be a tagged PDF (MarkInfo, Lang, structure tree) with no PDF/UA
// claim (it fails veraPDF), of a sane length, within the size budget, with
// only Atkinson Hyperlegible Next embedded, a one-page calendar, a one-page
// guide from the gmina's own rules and the text version after them. Every
// address's month tables are the same size, rows included, however many
// months it has, in one fixed 4 × 3 grid inside the page's margins (a
// whole year's twelve months on page 1), every row one height (no date's
// marks wrap), every header cell's text one padding in, the key in one
// line or two in one set of columns (none alone), at one place
// on the page whatever the street's name (the longest on one line), and so
// are the guide's tiles; no word on pages 1–2 spills
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
import { GUIDES } from "../lib/sorting-guide.ts";
import { walk } from "./lib/files.mjs";
import { pageStrokes, pageWords, spills } from "./lib/pdf-layout.mjs";
import { finish, startServer } from "./lib/server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_BYTES = 150_000;
const MIN_PAGES = 3;
// The calendar and „Co wrzucać” (a page each), then the text version.
const MAX_PAGES = 8;
// The town's streets (SIMC 0972447) are the Urząd Miejski's schedule, the
// rest the gmina's (lib/places.ts scheduleOwner).
const gminaOf = (p) =>
  p.startsWith("/adres/0972447") ? "Lubaczów (miasto)" : "Lubaczów (gmina)";
const CASES = [
  {
    name: "city street",
    path: "/adres/0972447-00470/harmonogram.pdf",
    page: "/adres/0972447-00470/smieci",
  },
  {
    name: "two-month street",
    path: "/adres/0972447-19253/harmonogram.pdf",
    page: "/adres/0972447-19253/smieci",
  },
  {
    // Longer than any real place's name (scripts/ci-fixture.ts): on one
    // line, the calendar where every address's is.
    name: "longest street name",
    path: "/adres/0972447-90011/harmonogram.pdf",
    page: "/adres/0972447-90011/smieci",
    title: true,
  },
  {
    name: "village",
    path: "/adres/0606375/harmonogram.pdf",
    page: "/adres/0606375/smieci",
  },
  {
    name: "split street, nr 7a",
    path: "/adres/0972447-90004/harmonogram.pdf?nr=7a",
    page: "/adres/0972447-90004/smieci?nr=7a",
  },
  {
    name: "split street, no nr",
    path: "/adres/0972447-90004/harmonogram.pdf",
    status: 404,
  },
  {
    name: "schedule ended",
    path: "/adres/0972447-90009/harmonogram.pdf",
    status: 404,
  },
];
// Responses the CDN keeps (when the gate is off), tagged DATASET alone, the
// import's purge, the only one (lib/headers.ts); the ended schedule's PDF
// is a 404.
const TAGGED = [
  "/adres/0972447-00470/harmonogram.pdf",
  "/ics/waste%3Amiasto-s1",
  "/adres/0972447-00470/woda.ics",
  "/adres/0972447-90009/harmonogram.pdf",
  "/api/search?q=asnyka",
];
// Every address route's shell (its ISR entry's tags, Next's
// x-next-cache-tags, each page's own entry in .next/server): tagged
// DATASET, so an import's purge reaches each one, the only way a shell
// cached with cacheLife "max" changes before the next deploy.
const PAGE_TAGS = [
  "/adres/0972447-00470",
  "/adres/0972447-00470/smieci",
  "/adres/0972447-00470/woda",
  "/adres/0972447-00470/prad",
];

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
// Page 1's fixed month grid (the route's MONTH_COLUMNS × MONTH_ROWS).
const GRID = { columns: 4, rows: 3 };
const round = (n) => Math.round(n * 100) / 100;
// Per case: page 1's table size and row height, page 2's largest tile.
const layouts = [];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
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
// size, so each size with enough squares is one code (the waste subpage's on
// page 1, the gmina's full rules on page 2).
function qrCodes(source) {
  const squares = [
    ...source.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re\b/g),
  ]
    .map((m) => m.slice(1, 5).map(Number))
    .filter(([, , w, h]) => w === h);
  return [...Map.groupBy(squares, ([, , w]) => w)]
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
    check(
      pages >= MIN_PAGES && pages <= MAX_PAGES,
      `${c.name}: ${pages} pages (expected ${MIN_PAGES}–${MAX_PAGES})`,
    );
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
    const gmina = gminaOf(c.path);
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
    // guide's QR code opens its full rules, and the text version lists every
    // source link. No other gmina's source appears anywhere.
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
    // The key, between the tables and the footer line: one line, or two
    // whose items stand in the first line's columns, never one item alone
    // under a fuller line. Items are words more than 2 U apart (a mark
    // between them); the first line's first word is the key's heading.
    const tablesEnd = Math.max(...tables.map((t) => t.y1));
    const keyLines = [];
    for (const w of words1
      .filter((w) => w.y0 > tablesEnd)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      const line = keyLines.find((l) => Math.abs(l[0].y0 - w.y0) < 2);
      if (line) line.push(w);
      else keyLines.push([w]);
    }
    keyLines.pop(); // the footer line
    const items = keyLines.map((line, i) =>
      line
        .sort((a, b) => a.x0 - b.x0)
        .slice(i === 0 ? 1 : 0)
        .reduce((out, w) => {
          const prev = out.at(-1);
          if (prev && w.x0 - prev.x1 <= 8) prev.x1 = w.x1;
          else out.push({ x0: w.x0, x1: w.x1 });
          return out;
        }, []),
    );
    const [first = [], second] = items;
    check(
      first.length > 0 &&
        items.length <= 2 &&
        (!second ||
          (second.length >= Math.min(2, first.length) &&
            second.length <= first.length &&
            second.every((item, i) => Math.abs(item.x0 - first[i].x0) < 1))),
      `${c.name}: page 1 key in ${items.length} lines of ${items.map((l) => l.length).join(" + ")} items (one line, or two in one set of columns, none alone)`,
    );
    // A fixed grid inside the page's margins: at most 4 × 3 tables on page
    // 1, a whole window's twelve months all of them, nothing carried over.
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
    });
    const guideUris = [...source.matchAll(/\/URI \((https:[^)]*)\)/g)]
      .map((m) => m[1])
      .filter((uri) => own.includes(uri) || others.includes(uri));
    check(
      guideUris.length > 0 && guideUris.every((uri) => own.includes(uri)),
      `${c.name}: guide links ${guideUris.join(", ")}, expected ${gmina}'s sources only`,
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
  for (const key of ["table", "date", "row", "top", "tile"]) {
    const seen = new Set(layouts.map((l) => l[key]));
    check(
      seen.size === 1 && !seen.has(null),
      `${key}: ${layouts.map((l) => `${l.name} ${l[key]}`).join("; ")} (the same for every address)`,
    );
  }
  console.log(
    `ok    one layout: tables ${layouts[0]?.table} from ${layouts[0]?.top} pt, date column ${layouts[0]?.date} pt, rows ${layouts[0]?.row} pt, tiles ${layouts[0]?.tile}`,
  );

  // The waste subpage of an ended schedule (the page that offers both) has
  // no dead PDF link and no empty calendar file.
  const ended = await (
    await fetch(`${server.origin}/adres/0972447-90009/smieci`)
  ).text();
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
  const ics = await fetch(`${server.origin}/ics/waste%3Amiasto-s1`);
  await ics.arrayBuffer();
  const disposition = ics.headers.get("content-disposition");
  check(
    disposition === 'inline; filename="wywoz-smieci-lubaczow-sektor-1.ics"',
    `/ics/waste%3Amiasto-s1: Content-Disposition ${disposition}`,
  );
  console.log(
    `ok    dataset tag alone on ${TAGGED.length} responses, ${PAGE_TAGS.length} address shells`,
  );
} finally {
  server.stop();
}

finish(
  failures,
  `PDFs: tagged, no PDF/UA claim, QR code and links to the waste subpage, a one-page calendar, then a one-page guide from the gmina's own rules, one layout for every address, nothing spilling out of its box, ${MIN_PAGES}–${MAX_PAGES} pages, ≤ ${MAX_BYTES / 1000} KB, Atkinson only, text version, no example data.`,
);
