// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf):
// its items in one line if they fit, else in two balanced rows, in columns
// as wide as their widest item, a fixed gap between them; never one item
// alone under a full row. More rows only as a last resort.

export type KeyGrid = {
  /** Rows the items take. */
  rows: number;
  /** Each item's place, in the items' order (row by row). */
  places: Array<{ row: number; x: number }>;
};

/** Each column's width: its widest item. */
const columnWidths = (widths: number[], cols: number) => {
  const out = Array<number>(cols).fill(0);
  widths.forEach((w, i) => {
    out[i % cols] = Math.max(out[i % cols], w);
  });
  return out;
};

/**
 * Lays out items of these widths in `room` points, `gap` between columns:
 * the fewest rows (one, then two balanced) whose columns fit.
 */
export function keyGrid(widths: number[], room: number, gap: number): KeyGrid {
  const n = widths.length;
  if (n === 0) return { rows: 1, places: [] };
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    // Rows fill in turn: skip a count that leaves the last row empty (4
    // items in 3 rows of 2) or with one item under a wider row (3 in 2 + 1).
    const last = n - (rows - 1) * cols;
    if (last < 1 || (cols > 1 && last < 2)) continue;
    const colW = columnWidths(widths, cols);
    const total = colW.reduce((a, b) => a + b, 0) + (cols - 1) * gap;
    if (total > room && cols > 1) continue;
    const colX = colW.map(
      (_, c) => colW.slice(0, c).reduce((a, b) => a + b, 0) + c * gap,
    );
    return {
      rows,
      places: widths.map((_, i) => ({
        row: Math.floor(i / cols),
        x: colX[i % cols],
      })),
    };
  }
  /* c8 ignore next */
  throw new Error("unreachable: one column always fits");
}
