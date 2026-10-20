// Checks the street PDFs (app/adres/[id]/harmonogram.pdf) on the CI fixture: a
// city street over twelve months, a village, and a split street with ?nr=.
// Each must be a tagged PDF of a sane length, within the size budget, with
// only Atkinson Hyperlegible Next embedded, the text-only version included
// and no example ("PRZYKŁADOWE DANE") content anywhere. A split street without a
// number has no PDF (404), as on the street page. Run after `next build`;
// needs poppler-utils (pdfinfo, pdffonts, pdftotext).
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "./lib/server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_BYTES = 150_000;
const MIN_PAGES = 2;
const MAX_PAGES = 6;
// The proposal stamp, not the home page's „Przykładowe adresy”.
const SAMPLE = /PRZYKŁADOWE DANE|podgląd układu/;
const CASES = [
  { name: "city street", path: "/adres/0972447-00470/harmonogram.pdf" },
  { name: "village", path: "/adres/0606375/harmonogram.pdf" },
  {
    name: "split street, nr 7a",
    path: "/adres/0972447-90004/harmonogram.pdf?nr=7a",
  },
  {
    name: "split street, no nr",
    path: "/adres/0972447-90004/harmonogram.pdf",
    status: 404,
  },
];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

// No example data in anything that ships.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
for (const file of ["app", "components", "lib"].flatMap((d) =>
  walk(path.join(ROOT, d)),
)) {
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
      text.includes("Serwis nieoficjalny"),
      `${c.name}: no "Serwis nieoficjalny" line`,
    );
    check(text.includes("Źródło:"), `${c.name}: no source line`);
    check(
      !SAMPLE.test(text),
      `${c.name}: example ("PRZYKŁADOWE DANE") content`,
    );
    console.log(
      `ok    ${c.name}: ${pages} pages, ${(bytes.length / 1000).toFixed(1)} KB, fonts ${[...new Set(names)].join(", ")}`,
    );
  }
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  `PDFs: tagged, ${MIN_PAGES}–${MAX_PAGES} pages, ≤ ${MAX_BYTES / 1000} KB, Atkinson only, text version, no example data.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
