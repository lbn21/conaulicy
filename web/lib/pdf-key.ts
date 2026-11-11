// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf): one
// fixed grid, the same on every address's PDF (Tech Lead, t334). Its
// heading on a line of its own, then KEY_ROWS rows of KEY_COLUMNS equal
// cells across the content width: room for every fraction a zone's
// 12 months can hold (ten in the city's). An address fills the cells in
// KEY_LABELS's order, row by row, and leaves the rest empty.

export const KEY_COLUMNS = 5;
export const KEY_ROWS = 2;

/**
 * The key's short names and fixed order (Tech Lead, t334): the key only;
 * the guide's tiles keep the full names (lib/waste-bin.ts FRACTIONS).
 */
export const KEY_LABELS: ReadonlyArray<{ subtype: string; label: string }> = [
  { subtype: "zmieszane", label: "Zmieszane" },
  { subtype: "papier", label: "Papier" },
  { subtype: "tworzywa_metale", label: "Plastik i metal" },
  { subtype: "szklo", label: "Szkło" },
  { subtype: "bio", label: "Bio" },
  { subtype: "popiol", label: "Popiół" },
  { subtype: "wielkogabarytowe", label: "Gabaryty" },
  { subtype: "elektro", label: "Elektroodpady" },
  { subtype: "opony", label: "Opony" },
  { subtype: "tekstylia", label: "Tekstylia" },
];

const ORDER = KEY_LABELS.map(({ subtype }) => subtype);

/** These fractions in the key's order; any it does not list, after. */
export function keyOrder(tones: Iterable<string>): string[] {
  const rank = (tone: string) =>
    ORDER.includes(tone) ? ORDER.indexOf(tone) : ORDER.length;
  return [...new Set(tones)].sort((a, b) => rank(a) - rank(b));
}

export type KeyGrid = {
  columns: number;
  rows: number;
  /** Every cell's width. */
  cellW: number;
  /** Each column's left edge, from the content's. */
  x: number[];
};

/**
 * The grid for every address: KEY_COLUMNS equal cells across `room`,
 * `gap` between them, KEY_ROWS rows (more only if a zone's key ever held
 * more than the cells, never narrower cells).
 */
export function keyGrid(room: number, gap: number, most: number): KeyGrid {
  const columns = KEY_COLUMNS;
  const cellW = (room - (columns - 1) * gap) / columns;
  return {
    columns,
    rows: Math.max(KEY_ROWS, Math.ceil(most / columns)),
    cellW,
    x: Array.from({ length: columns }, (_, c) => c * (cellW + gap)),
  };
}

/** The i-th item's cell: row by row, left to right. */
export function keyCell(grid: KeyGrid, i: number) {
  return { row: Math.floor(i / grid.columns), x: grid.x[i % grid.columns] };
}
