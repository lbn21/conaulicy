// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf): one
// fixed grid, the same on every address's PDF (Tech Lead, PR #269). Its
// heading on a line of its own, then KEY_ROWS rows of KEY_COLUMNS equal
// cells, each as wide as the widest item any zone's key can hold; an
// address fills the cells in order, row by row, and leaves the rest empty.

/** The grid's columns: the fullest zone's key (six fractions) in two rows. */
export const KEY_COLUMNS = 3;
/** The grid's rows, never fewer, whatever an address shows. */
export const KEY_ROWS = 2;

export type KeyGrid = {
  columns: number;
  rows: number;
  /** Every cell's width: the widest item any zone's key can hold. */
  cellW: number;
  /** Each column's left edge, from the grid's. */
  x: number[];
  /** Whether the columns fit the room. */
  fits: boolean;
};

/**
 * The grid for every address: `widths`, every item any zone's key can
 * hold; `most`, the most items one zone's key holds. More than
 * KEY_COLUMNS × KEY_ROWS items take more rows, never more columns; columns
 * too wide for `room` say so (fits: false), never narrower cells.
 */
export function keyGrid(
  widths: number[],
  most: number,
  room: number,
  gap: number,
): KeyGrid {
  const cellW = Math.max(0, ...widths);
  const columns = KEY_COLUMNS;
  const rows = Math.max(KEY_ROWS, Math.ceil(most / columns));
  const x = Array.from({ length: columns }, (_, c) => c * (cellW + gap));
  return {
    columns,
    rows,
    cellW,
    x,
    fits: columns * cellW + (columns - 1) * gap <= room + 1e-6,
  };
}

/** The i-th item's cell: row by row, left to right. */
export function keyCell(grid: KeyGrid, i: number) {
  return { row: Math.floor(i / grid.columns), x: grid.x[i % grid.columns] };
}
