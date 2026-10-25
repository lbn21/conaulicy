// npm run prg:update: rewrites lib/prg-numbers.generated.ts, every house
// number the national address register (PRG, GUGiK) has at each of our
// places, from its address points for powiat 1809. The zip goes to a temp
// dir and is never kept; only the derived file is committed. Places are
// TERYT's (lib/zuk-places.generated.ts): a street by ID_SIMC + ID_ULIC, a
// village without streets by ID_SIMC alone. A place PRG has no point for is
// left out, so the page knows nothing about it (lib/prg.ts), rather than
// "no numbers". Run it when PRG publishes new points (its file date is in
// the header).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { prgNumber } from "../lib/house.ts";
import { ZUK_PLACES } from "../lib/zuk-places.generated.ts";
import { gminaTercs, loadConfig, ROOT } from "./import/core/config.ts";

const URL = "https://integracja.gugik.gov.pl/PRG/pobierz.php?teryt=1809&adresy";
const PAGE =
  "https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/";
const ENTRY = "PRG_PunktyAdresowe_1809.dbf";
const OUT = path.join(ROOT, "web/lib/prg-numbers.generated.ts");

type Entry = { data: Buffer; date: string };

/** One file of a zip, from its central directory (stored or deflated). */
function unzip(zip: Buffer, name: string): Entry {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const day = zip.readUInt16LE(at + 14);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString("utf8", at + 46, at + 46 + nameLength) === name) {
      const start =
        local +
        30 +
        zip.readUInt16LE(local + 26) +
        zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + size);
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        data: method === 0 ? raw : inflateRawSync(raw),
        date: `${1980 + (day >> 9)}-${pad((day >> 5) & 15)}-${pad(day & 31)}`,
      };
    }
    at += 46 + nameLength + extra;
  }
  throw new Error(`${name}: not in the zip`);
}

/** A dBASE III table's rows, every field as trimmed text (UTF-8, .cpg). */
function readDbf(dbf: Buffer): Array<Record<string, string>> {
  const rows = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const rowLength = dbf.readUInt16LE(10);
  const fields: Array<{ name: string; offset: number; length: number }> = [];
  for (let at = 32, offset = 1; dbf[at] !== 0x0d; at += 32) {
    const length = dbf[at + 16];
    const name = dbf.toString("latin1", at, at + 11).replace(/\0.*$/, "");
    fields.push({ name, offset, length });
    offset += length;
  }
  const out: Array<Record<string, string>> = [];
  for (let i = 0; i < rows; i++) {
    const row = headerLength + i * rowLength;
    if (dbf[row] === 0x2a) continue; // deleted
    out.push(
      Object.fromEntries(
        fields.map((f) => [
          f.name,
          dbf
            .toString("utf8", row + f.offset, row + f.offset + f.length)
            .trim(),
        ]),
      ),
    );
  }
  return out;
}

/** "2" before "10", "10" before "10A", "116" before "116/1-3". */
function byNumber(a: string, b: string): number {
  return a.localeCompare(b, "pl", { numeric: true });
}

const response = await fetch(URL);
if (!response.ok) throw new Error(`${URL}: HTTP ${response.status}`);
const dir = mkdtempSync(path.join(tmpdir(), "prg-"));
let zip: Buffer;
try {
  zip = Buffer.from(await response.arrayBuffer());
  writeFileSync(path.join(dir, "1809.zip"), zip);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { data, date } = unzip(zip, ENTRY);

const tercs = new Set(gminaTercs(loadConfig()));
const withStreets = new Set(ZUK_PLACES.streets.map((s) => s.localityId));
const places = [
  ...ZUK_PLACES.streets.map((s) => s.id),
  ...ZUK_PLACES.localities
    .filter((l) => !withStreets.has(l.id))
    .map((l) => l.id),
];
const known = new Set(places);

const numbers = new Map<string, Set<string>>();
let points = 0;
let unplaced = 0;
for (const row of readDbf(data)) {
  if (!tercs.has(row.TERYT_GMI)) continue;
  points++;
  const id = row.ID_ULIC ? `${row.ID_SIMC}-${row.ID_ULIC}` : row.ID_SIMC;
  const nr = prgNumber(row.NUMER_PORZ);
  if (!known.has(id) || !nr) {
    unplaced++;
    continue;
  }
  if (!numbers.has(id)) numbers.set(id, new Set());
  numbers.get(id)?.add(nr);
}

const lines = [...numbers]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, set]) => `${id};${[...set].sort(byNumber).join(",")}`);
const missing = places.filter((id) => !numbers.has(id));

writeFileSync(
  OUT,
  `// Generated by \`npm run prg:update\` (scripts/prg-update.ts); do not edit.
// Every house number (NUMER_PORZ, trimmed, letters upper case) of PRG's
// address points at our places, gminy ${[...tercs].join(", ")}: ${numbers.size} of ${places.length}
// places. Source: Państwowy Rejestr Granic, punkty adresowe, GUGiK
// (${PAGE}),
// ${URL}, file ${ENTRY} of ${date}.
// Free for any use (art. 40a ust. 2 ustawy Prawo geodezyjne i kartograficzne).
// Read only by lib/prg.ts, server-only (scripts/check-bundle.mjs).

// place id;numbers
export const PRG_NUMBERS = \`
${lines.join("\n")}
\`;
`,
);

console.log(
  `PRG ${date}: ${points} points in gminy ${[...tercs].join(", ")}, ${unplaced} not at one of our places.`,
);
console.log(
  `Coverage: ${numbers.size} of ${places.length} places have numbers; ${missing.length} have none (no data):`,
);
const names = new Map([
  ...ZUK_PLACES.streets.map((s) => [s.id, s.name] as const),
  ...ZUK_PLACES.localities.map((l) => [l.id, l.name] as const),
]);
for (const id of missing) console.log(`  ${id} ${names.get(id)}`);
