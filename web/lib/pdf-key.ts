import { FRACTIONS, tones } from "./waste-bin.ts";

// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf): one
// fixed grid, the same on every address's PDF whatever the data: a cell for
// every fraction the site knows (KEY_TONES, from lib/waste-bin.ts
// FRACTIONS). Its heading on a line of its own, then equal cells across the
// content width, as many columns as the widest name allows. An address
// fills the cells in KEY_ORDER, row by row, and leaves the rest empty.

/** Page 1's months: the current one and the five after it. */
export const PDF_MONTHS = 6;

/** The key's fixed order (Tech Lead, t334); any fraction it lacks, after. */
export const KEY_ORDER: readonly string[] = [
  "zmieszane",
  "papier",
  "tworzywa_metale",
  "tworzywa",
  "szklo",
  "bio",
  "popiol",
  "wielkogabarytowe",
  "elektro",
  "opony",
  "tekstylia",
];

/** These fractions in the key's order. */
export function keyOrder(tones: Iterable<string>): string[] {
  const rank = (tone: string) =>
    KEY_ORDER.includes(tone) ? KEY_ORDER.indexOf(tone) : KEY_ORDER.length;
  return [...new Set(tones)].sort((a, b) => rank(a) - rank(b));
}

/** Every fraction the site knows, in the key's order: the key's cells. */
export const KEY_TONES: readonly string[] = keyOrder(
  FRACTIONS.flatMap(({ subtype }) => tones(subtype)),
);

export type KeyGrid = {
  columns: number;
  rows: number;
  /** Every cell's width. */
  cellW: number;
  /** Each column's left edge, from the content's. */
  x: number[];
};

/**
 * The grid for every address: the most equal columns across `room` (`gap`
 * between them) whose cells hold `widest`, and the rows `most` items need.
 */
export function keyGrid(
  room: number,
  gap: number,
  widest: number,
  most: number,
): KeyGrid {
  const cellOf = (n: number) => (room - (n - 1) * gap) / n;
  let columns = 1;
  while (cellOf(columns + 1) >= widest && columns + 1 <= Math.max(1, most)) {
    columns++;
  }
  const cellW = cellOf(columns);
  return {
    columns,
    rows: Math.max(1, Math.ceil(most / columns)),
    cellW,
    x: Array.from({ length: columns }, (_, c) => c * (cellW + gap)),
  };
}

/** The i-th item's cell: row by row, left to right. */
export function keyCell(grid: KeyGrid, i: number) {
  return { row: Math.floor(i / grid.columns), x: grid.x[i % grid.columns] };
}
