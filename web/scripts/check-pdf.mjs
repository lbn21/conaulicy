// Checks the street PDFs (app/adres/[id]/harmonogram.pdf) on the CI fixture: a
// city street over twelve months, a village, and a split street with ?nr=.
// Each must be a tagged PDF (MarkInfo, Lang, structure tree) with no PDF/UA
// claim (it fails veraPDF), of a sane length, within the size budget, with
// only Atkinson Hyperlegible Next embedded, the text-only version included,
// the "not double-checked" note (the fixture is unverified) and no example
// ("PRZYKŁADOWE DANE") content anywhere. A split street without a number has
// no PDF (404), as on the street page; nor has a street whose schedule has
// ended, and its page offers neither the PDF nor the calendar file. The PDF,
// ICS and search responses carry the dataset cache tag, so an import's
// revalidate purges their CDN copies; the water calendar, hub and /woda
// page the water tag too, so the ZUK cron's purge reaches them, and the
// waste subpage does not. The QR code, read back from the page,
// and every printed link open the waste subpage on SITE_URL. Run after
// `next build`; needs poppler-utils (pdfinfo, pdffonts, pdftotext).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import QRCode from "qrcode";
import { SITE_URL } from "../lib/config.generated.ts";
import {
  DISCLAIMER,
  NO_MORE_DATES,
  UNVERIFIED_NOTE,
} from "../lib/schedule-notes.ts";
import { notSource, walk } from "./lib/files.mjs";
import { finish, startServer } from "./lib/server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_BYTES = 150_000;
const MIN_PAGES = 2;
const MAX_PAGES = 6;
// The proposal stamp, not the home page's „Przykładowe adresy”.
const SAMPLE = /PRZYKŁADOWE DANE|podgląd układu/;
const CASES = [
  {
    name: "city street",
    path: "/adres/0972447-00470/harmonogram.pdf",
    page: "/adres/0972447-00470/smieci",
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
// Responses the CDN keeps (when the gate is off), tagged for the purge: the
// waste ones DATASET only, the water calendar WATER beside it, which the ZUK
// cron purges (lib/headers.ts).
const WATER_TAGGED = ["/adres/0972447-00470/woda.ics"];
// Pages: their ISR entry's tags, Next's x-next-cache-tags (the ZUK file's
// unstable_cache tag included), each page's own entry in .next/server.
const PAGE_TAGS = [
  { path: "/adres/0972447-00470", water: true },
  { path: "/adres/0972447-00470/woda", water: true },
  { path: "/adres/0972447-00470/smieci", water: false },
];
const TAGGED = [
  "/adres/0972447-00470/harmonogram.pdf",
  "/adres/0972447-90009/harmonogram.pdf",
  "/ics/waste%3Amiasto-s1",
  "/api/search?q=asnyka",
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

// The QR code's modules, read back from the drawing: one square per dark
// module ("x y w h re", w = h = cell + 0.05), the most common square size.
// Null if there is none.
function qrModules(source) {
  const squares = [
    ...source.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re\b/g),
  ]
    .map((m) => m.slice(1, 5).map(Number))
    .filter(([, , w, h]) => w === h);
  const counts = Map.groupBy(squares, ([, , w]) => w);
  const [w, cells] =
    [...counts].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!cells || cells.length < 100) return null;
  const cell = w - 0.05;
  const x0 = Math.min(...cells.map(([x]) => x));
  const y0 = Math.min(...cells.map(([, y]) => y));
  const size = Math.round((Math.max(...cells.map(([x]) => x)) - x0) / cell + 1);
  const grid = new Uint8Array(size * size);
  for (const [x, y] of cells) {
    grid[Math.round((y - y0) / cell) * size + Math.round((x - x0) / cell)] = 1;
  }
  return { size, grid };
}

// Whether the drawn modules are exactly the code for url.
function qrEncodes(modules, url) {
  const want = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  return (
    modules !== null &&
    modules.size === want.size &&
    modules.grid.every((dark, i) => dark === want.data[i])
  );
}

// No example data in anything that ships.
const sources = ["app", "components", "lib"]
  .flatMap((d) => walk(path.join(ROOT, d), notSource))
  .filter((file) => /\.(ts|tsx|mjs)$/.test(file));
for (const file of sources) {
  check(
    !SAMPLE.test(readFileSync(file, "utf8")),
    `${path.relative(ROOT, file)}: example ("PRZYKŁADOWE DANE") content`,
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
    check(
      text.includes("Wersja tekstowa"),
      `${c.name}: no pointer to the text version`,
    );
    check(
      text.includes("Te same terminy co w kalendarzu"),
      `${c.name}: no text-only version`,
    );
    check(
      text.replace(/\s+/g, " ").includes(DISCLAIMER),
      `${c.name}: no "${DISCLAIMER}" line`,
    );
    check(text.includes("Źródło:"), `${c.name}: no source line`);
    // The QR code and the printed link: the waste subpage, never the hub or
    // a preview deployment.
    const page = SITE_URL + c.page;
    check(
      qrEncodes(qrModules(source), page),
      `${c.name}: the QR code does not open ${page}`,
    );
    check(
      text.includes(page.replace("https://", "")),
      `${c.name}: no printed link to ${page}`,
    );
    const links = [...source.matchAll(/\/URI \((https:[^)]*)\)/g)]
      .map((m) => m[1])
      .filter((uri) => uri.startsWith(SITE_URL));
    check(
      links.length > 0 && links.every((uri) => uri === page),
      `${c.name}: links ${links.join(", ")}, expected ${page} only`,
    );
    // A month is never split: each later page of the text version starts
    // with a month heading ("Marzec 2027", maybe "(ciąg dalszy)") or a line
    // about months without dates ("2027: ..."), never with a lone date.
    for (let page = 2; page <= pages; page++) {
      const lines = run("pdftotext", [
        "-f",
        String(page),
        "-l",
        String(page),
        file,
        "-",
      ])
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const band = lines.findIndex((line) =>
        line.endsWith("· wersja tekstowa, ciąg dalszy"),
      );
      if (band < 0) continue;
      const first = lines[band + 1] ?? "";
      check(
        /^\p{Lu}\p{Ll}+ \d{4}( \(ciąg dalszy\))?$/u.test(first) ||
          /^[\p{Ll}\d– ]+: /u.test(first),
        `${c.name}: page ${page} of the text version starts mid-month ("${first}")`,
      );
    }
    check(
      text.replace(/\s+/g, " ").includes(UNVERIFIED_NOTE),
      `${c.name}: no "not double-checked" note`,
    );
    check(
      !SAMPLE.test(text),
      `${c.name}: example ("PRZYKŁADOWE DANE") content`,
    );
    console.log(
      `ok    ${c.name}: ${pages} pages, ${(bytes.length / 1000).toFixed(1)} KB, fonts ${[...new Set(names)].join(", ")}`,
    );
  }

  // The waste subpage of an ended schedule (the page that offers both) says
  // so, with no dead PDF link and no empty calendar file.
  const ended = await (
    await fetch(`${server.origin}/adres/0972447-90009/smieci`)
  ).text();
  check(
    // Links only: the RSC payload names the sibling route harmonogram.pdf.
    !/href="[^"]*harmonogram\.pdf/.test(ended) &&
      !ended.includes('href="/ics/'),
    "schedule ended: the page still offers the PDF or the calendar file",
  );
  check(ended.includes(NO_MORE_DATES), "schedule ended: no notice on the page");
  console.log("ok    schedule ended: page without PDF or calendar file");

  for (const p of TAGGED) {
    const response = await fetch(server.origin + p);
    check(
      response.headers.get("vercel-cache-tag") === "dataset",
      `${p}: Vercel-Cache-Tag ${response.headers.get("vercel-cache-tag")}, expected dataset`,
    );
  }
  for (const p of WATER_TAGGED) {
    const response = await fetch(server.origin + p);
    await response.arrayBuffer();
    check(
      response.status === 200 &&
        response.headers.get("vercel-cache-tag") === "dataset,water",
      `${p}: ${response.status}, Vercel-Cache-Tag ${response.headers.get("vercel-cache-tag")}, expected dataset,water`,
    );
  }
  for (const { path: p, water } of PAGE_TAGS) {
    await (await fetch(server.origin + p)).text();
    const tags = await pageTags(p);
    check(
      tags?.includes("dataset") && tags.includes("water") === water,
      `${p}: cache tags ${tags?.join(",") ?? "(no entry)"}, expected dataset${water ? ",water" : " without water"}`,
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
    `ok    cache tag on ${TAGGED.length + WATER_TAGGED.length} responses, ${PAGE_TAGS.length} pages`,
  );
} finally {
  server.stop();
}

finish(
  failures,
  `PDFs: tagged, no PDF/UA claim, QR code and links to the waste subpage, ${MIN_PAGES}–${MAX_PAGES} pages, ≤ ${MAX_BYTES / 1000} KB, Atkinson only, text version, no example data.`,
);
