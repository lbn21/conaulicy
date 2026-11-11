// Page 1's month grid, as a council bin leaflet's: identical, fully bordered
// month tables (a title cell, a „Dzień | Odpady” header row, then the same
// number of body rows in every month: as many as the fullest month needs,
// empty ones left blank), in a strict grid of equal columns; each calendar
// year starts a new row under its heading. Pure, so the choice is tested
// without a PDF (lib/pdf-grid.test.ts).

type GridMonth = {
  /** "YYYY-MM". */
  key: string;
  /** How many marks each of its dates has, in order. */
  marks: number[];
};

export type GridInput = {
  months: GridMonth[];
  /** Width for the grid, and the space between tables. */
  width: number;
  gap: number;
  /** Height from the grid's top to the key. */
  height: number;
  /** A year heading with its space below; the space between table rows. */
  yearH: number;
  rowGap: number;
  /** The date column: the widest date, or „Dzień”, with its padding. */
  dateW: number;
  /** The narrowest the marks column may be: its header with its padding. */
  minMarksW: number;
  /** Inner padding of a cell, a mark's size and the space between marks. */
  pad: number;
  mark: number;
  markGap: number;
  maxColumns: number;
  minColumns: number;
  /** Body and header rows: as tall as fits, between these, in steps. */
  maxRow: number;
  minRow: number;
  rowStep: number;
};

export type Grid = {
  columns: number;
  tableW: number;
  /** Marks a body row holds; a date with more takes more rows. */
  perLine: number;
  /** Body rows in every table. */
  bodyRows: number;
  rowH: number;
  /** Table rows, in order: each year's months, `columns` at a time. */
  rows: Array<{ year: string; keys: string[] }>;
  /** Whether it all fits the height at rowH. */
  fits: boolean;
};

/** Rows a date takes: one per `perLine` marks, at least one. */
export const dateRows = (marks: number, perLine: number) =>
  Math.max(1, Math.ceil(marks / perLine));

/**
 * The table rows: each calendar year's months, `columns` to a row, so a
 * month always sits under its own year's heading.
 */
function tableRows(months: GridMonth[], columns: number) {
  const rows: Array<{ year: string; keys: string[] }> = [];
  for (const { key } of months) {
    const year = key.slice(0, 4);
    const last = rows.at(-1);
    if (last && last.year === year && last.keys.length < columns) {
      last.keys.push(key);
    } else rows.push({ year, keys: [key] });
  }
  return rows;
}

/** Rows that start under a year heading: the first, and each new year's. */
export const headed = (rows: Grid["rows"]) =>
  rows.map((row, i) => i === 0 || row.year !== rows[i - 1].year);

/** Height of a grid of these rows at a row height. */
export function gridHeight(
  rows: Grid["rows"],
  bodyRows: number,
  rowH: number,
  input: Pick<GridInput, "yearH" | "rowGap">,
): number {
  const years = headed(rows).filter(Boolean).length;
  return (
    years * input.yearH +
    rows.length * (bodyRows + 2) * rowH +
    (rows.length - 1) * input.rowGap
  );
}

/**
 * The grid for these months: of the column counts whose marks column is
 * wide enough, the one that fits the height, then has no date across two
 * rows, then has the tallest rows, then the most columns. If none fits at
 * the smallest rows, the shortest grid, at those rows (the caller runs it
 * on to more pages).
 */
export function chooseGrid(input: GridInput): Grid {
  const options: Grid[] = [];
  for (let columns = input.maxColumns; columns >= input.minColumns; columns--) {
    const tableW = (input.width - input.gap * (columns - 1)) / columns;
    const marksW = tableW - input.dateW;
    if (marksW < input.minMarksW || marksW < input.mark + 2 * input.pad) {
      continue;
    }
    const perLine = Math.floor(
      (marksW - 2 * input.pad + input.markGap) / (input.mark + input.markGap),
    );
    const bodyRows = Math.max(
      1,
      ...input.months.map((month) =>
        month.marks.reduce((sum, n) => sum + dateRows(n, perLine), 0),
      ),
    );
    const rows = tableRows(input.months, columns);
    const unit = gridHeight(rows, bodyRows, 1, { yearH: 0, rowGap: 0 });
    const fixed = gridHeight(rows, bodyRows, 0, input);
    const raw = (input.height - fixed) / unit;
    // On the spacing scale, so near-equal options tie and the wider wins.
    const rowH = Math.min(
      input.maxRow,
      Math.floor(raw / input.rowStep) * input.rowStep,
    );
    options.push({
      columns,
      tableW,
      perLine,
      bodyRows,
      rowH: Math.max(input.minRow, rowH),
      rows,
      fits: rowH >= input.minRow,
    });
  }
  if (options.length === 0) throw new Error("chooseGrid: no column count fits");
  const wraps = (grid: Grid) =>
    input.months.some((month) => month.marks.some((n) => n > grid.perLine));
  const fitting = options.filter((grid) => grid.fits);
  if (fitting.length === 0) {
    return options.reduce((best, grid) =>
      gridHeight(grid.rows, grid.bodyRows, input.minRow, input) <
      gridHeight(best.rows, best.bodyRows, input.minRow, input)
        ? grid
        : best,
    );
  }
  return fitting.reduce((best, grid) => {
    if (wraps(grid) !== wraps(best)) return wraps(grid) ? best : grid;
    if (grid.rowH !== best.rowH) return grid.rowH > best.rowH ? grid : best;
    return grid.columns > best.columns ? grid : best;
  });
}
