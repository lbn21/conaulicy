// Made-up schedules for scripts/check-import-schedules.mjs: a gmina PDF with
// a real text layer (pdfkit, laid out like the published ones, so the real
// pdftotext parser runs) and the two vision readings of a city JPG. Never
// real data.
import path from "node:path";
import PDFDocument from "pdfkit";
import { MONTHS } from "../schedules/lib.ts";

const FONT = path.join(
  import.meta.dirname,
  "../../assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf",
);

/** Every other given weekday (0 = Sunday) of the year, per month. */
export function fortnightly(
  year: number,
  weekday: number,
  offset = 0,
): number[][] {
  const months: number[][] = MONTHS.map(() => []);
  const date = new Date(Date.UTC(year, 0, 1, 12));
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCDate(date.getUTCDate() + 7 * offset);
  while (date.getUTCFullYear() === year) {
    months[date.getUTCMonth()].push(date.getUTCDate());
    date.setUTCDate(date.getUTCDate() + 14);
  }
  return months;
}

/** A gmina-style PDF: places in the left column, three date columns. */
export function gminaPdf(
  places: string[],
  rows: number[][][],
): Promise<Buffer> {
  const fixed = new Date(Date.UTC(2026, 0, 1));
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 30,
    info: { CreationDate: fixed, ModDate: fixed },
  });
  doc.registerFont("r", FONT).font("r").fontSize(9);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  const x = [30, 260, 400, 540, 680];
  let y = 40;
  const line = (cells: string[]) => {
    cells.forEach((text, i) => {
      if (text) doc.text(text, x[i], y, { lineBreak: false });
    });
    y += 22;
  };
  line([
    "MIEJSCOWOŚCI",
    "MIESIĄC",
    "ZMIESZANE I BIO",
    "SELEKTYWNE",
    "WIELKOGABARYTOWE",
  ]);
  const left = places.join(", ");
  MONTHS.forEach((month, i) => {
    const cell = (days: number[]) => (days.length ? days.join(",") : "-");
    line([i === 0 ? left : "", month, ...rows.map((r) => cell(r[i]))]);
  });
  line(["ODPADY WYSTAWIAMY DO GODZ. 6:00 – WSZYSTKIE FRAKCJE"]);
  doc.end();
  return done;
}
