// Page 1's month grid, as a council bin leaflet's: identical, fully bordered
// month tables (a title cell, a „Dzień | Odpady” header row, then the same
// number of body rows in every month: as many as the fullest month needs,
// empty ones left blank), in a strict grid of equal columns; each calendar
// year starts a new row under its heading. Sized once for the largest case
// (every month of the window, each as full as the fullest month of any
// address, `profiles`), so every address gets the same tables: fewer months
// leave the space below empty, never larger tables. A date's marks never
// wrap: the marks column holds the most any date has in the data, at the
// same table width: first the date column narrows (it holds one or two
// digits), then the marks close up, then they shrink a little; past that the
// grid does not fit (the caller takes a smaller size).
// Pure, so the choice is tested without a PDF (lib/pdf-grid.test.ts).

type GridMonth = {
  /** "YYYY-MM". */
  key: string;
  /** How many marks each of its dates has, in order. */
  marks: number[];
};

export type GridInput = {
  months: GridMonth[];
  /**
   * Other months' marks per date (every address's, from the data): the body
   * rows hold the fullest of these too.
   */
  profiles?: number[][];
  /**
   * Marks to hold beyond the fullest date (+1: room for one more than the
   * data has today); 0 by default.
   */
  headroom?: number;
  /** Width for the grid, and the space between tables. */
  width: number;
  gap: number;
  /** Height from the grid's top to the key. */
  height: number;
  /** A year heading with its space below; the space between table rows. */
  yearH: number;
  rowGap: number;
  /** The date column: „Dzień” or the widest date, with its padding … */
  dateW: number;
  /** … and the narrowest it may be, for wider marks: with less padding. */
  minDateW: number;
  /** The narrowest the marks column may be: its header with its padding. */
  minMarksW: number;
  /** Inner padding of a cell, a mark's size and the space between marks. */
  pad: number;
  mark: number;
  markGap: number;
  /** The least the marks may close up and shrink to, past a narrow date. */
  minMarkGap: number;
  minMark: number;
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
  /** The date column, and the marks' size and gap, in this table width. */
  dateW: number;
  mark: number;
  markGap: number;
  /** Marks a body row holds: at least the most any date has, if it fits. */
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
export function tableRows(
  months: Array<Pick<GridMonth, "key">>,
  columns: number,
) {
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

/** The most marks any one date has, in these months and the profiles. */
export const mostMarks = (input: Pick<GridInput, "months" | "profiles">) =>
  Math.max(
    0,
    ...[...input.months.map((m) => m.marks), ...(input.profiles ?? [])].flat(),
  );

/**
 * The date column and marks that hold `most` marks on one line in a table
 * this wide: the preferred date column if the marks fit beside it; else the
 * marks column exactly as wide as they need, the date column the rest, down
 * to its narrowest; else the marks closer, then smaller, down to their
 * least (in quarter points, the date column taking the rest). Null if even that leaves too little room.
 */
export function fitMarks(
  tableW: number,
  most: number,
  input: Pick<
    GridInput,
    | "dateW"
    | "minDateW"
    | "minMarksW"
    | "pad"
    | "mark"
    | "markGap"
    | "minMarkGap"
    | "minMark"
  >,
): { dateW: number; mark: number; markGap: number } | null {
  const n = Math.max(1, most);
  const need = (mark: number, gap: number) =>
    Math.max(input.minMarksW, 2 * input.pad + n * mark + (n - 1) * gap);
  const { mark, markGap } = input;
  if (tableW - input.dateW >= need(mark, markGap)) {
    return { dateW: input.dateW, mark, markGap };
  }
  if (tableW - need(mark, markGap) >= input.minDateW) {
    return { dateW: tableW - need(mark, markGap), mark, markGap };
  }
  const room = tableW - input.minDateW - 2 * input.pad;
  if (tableW - input.minDateW < input.minMarksW) return null;
  // Quarter points: the least change that fits.
  const quarter = (x: number) => Math.floor(x * 4) / 4;
  if (n > 1) {
    const gap = quarter((room - n * mark) / (n - 1));
    if (gap >= input.minMarkGap) {
      return { dateW: tableW - need(mark, gap), mark, markGap: gap };
    }
  }
  const gap = n > 1 ? input.minMarkGap : markGap;
  const small = quarter((room - (n - 1) * gap) / n);
  // The rounding's rest to the date column: the marks' padding stays even.
  return small >= input.minMark
    ? { dateW: tableW - need(small, gap), mark: small, markGap: gap }
    : null;
}

/**
 * The grid for these months: of the column counts whose marks column is
 * wide enough and holds every date's marks on one line, the one that fits
 * the height, then has the tallest rows, then the most columns. If none
 * fits, the shortest grid, at the smallest rows (`fits` false: the caller
 * tries a smaller size).
 */
export function chooseGrid(input: GridInput): Grid {
  // The worst case of every address (profiles), never this one's own.
  const most = mostMarks(input) + (input.headroom ?? 0);
  const options: Grid[] = [];
  for (let columns = input.maxColumns; columns >= input.minColumns; columns--) {
    const tableW = (input.width - input.gap * (columns - 1)) / columns;
    const fitted = fitMarks(tableW, most, input);
    const cell = fitted ?? {
      dateW: input.dateW,
      mark: input.mark,
      markGap: input.markGap,
    };
    const marksW = tableW - cell.dateW;
    if (marksW < input.minMarksW || marksW < cell.mark + 2 * input.pad) {
      continue;
    }
    const perLine = Math.floor(
      (marksW - 2 * input.pad + cell.markGap) / (cell.mark + cell.markGap),
    );
    const bodyRows = Math.max(
      1,
      ...[
        ...input.months.map((month) => month.marks),
        ...(input.profiles ?? []),
      ].map((marks) => marks.reduce((sum, n) => sum + dateRows(n, perLine), 0)),
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
      ...cell,
      perLine,
      bodyRows,
      rowH: Math.max(input.minRow, rowH),
      rows,
      fits: rowH >= input.minRow && fitted !== null && perLine >= most,
    });
  }
  if (options.length === 0) throw new Error("chooseGrid: no column count fits");
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
    if (grid.rowH !== best.rowH) return grid.rowH > best.rowH ? grid : best;
    return grid.columns > best.columns ? grid : best;
  });
}
