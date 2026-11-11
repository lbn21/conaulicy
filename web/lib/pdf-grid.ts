// Page 1's month grid, as a council bin leaflet's: identical, fully bordered
// month tables (a title cell, a „Dzień | Odpady” header row, then the same
// number of body rows in every month: as many as the fullest month needs,
// empty ones left blank), in one fixed grid of `columns` × `gridRows`
// (4 × 3: the twelve months of the window), each grid row under a strip
// for its year headings: a year's heading above its first month, wherever
// in the row that falls, so a year never needs a row of its own and every
// address's grid has the same geometry. Sized once for the largest case
// (every month of the window, each as full as the fullest month of any
// address, `profiles`): fewer months leave the space below empty, never
// larger tables. A date's marks never wrap: the marks column holds the most
// any date has in the data, at the same table width: the date column
// narrows (it holds one or two digits), then the marks may close up and
// shrink to the caller's least (the PDF allows neither); past that the grid
// does not fit (the caller takes a smaller size).
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
  /** Marks a date always has room for, whatever the data (5 in the PDF). */
  least?: number;
  /** Width for the grid, and the space between tables. */
  width: number;
  gap: number;
  /** Height from the grid's top to the key. */
  height: number;
  /** A row's year strip (a heading with its space below); the space between table rows. */
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
  /** The fixed grid: tables across, and rows of them. */
  columns: number;
  gridRows: number;
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
  /** Table rows of these months, in order, `columns` at a time. */
  rows: GridRow[];
  /** Whether it all fits the height at rowH. */
  fits: boolean;
};

/** Rows a date takes: one per `perLine` marks, at least one. */
export const dateRows = (marks: number, perLine: number) =>
  Math.max(1, Math.ceil(marks / perLine));

/** A grid row: its months, and the year headings in its strip. */
export type GridRow = {
  keys: string[];
  /** A heading per year starting in this row (the first row's first month too), by column. */
  years: Array<{ column: number; year: string }>;
};

/**
 * The table rows: the months in order, `columns` to a row, whatever their
 * year; a year's heading in the row's strip above its first month (the
 * first month of all, and every January).
 */
export function tableRows(
  months: Array<Pick<GridMonth, "key">>,
  columns: number,
): GridRow[] {
  const rows: GridRow[] = [];
  months.forEach(({ key }, i) => {
    const column = i % columns;
    if (column === 0) rows.push({ keys: [], years: [] });
    const row = rows[rows.length - 1];
    row.keys.push(key);
    if (i === 0 || key.endsWith("-01"))
      row.years.push({ column, year: key.slice(0, 4) });
  });
  return rows;
}

/** Height of `gridRows` rows of tables, each under its year strip, at a row height. */
export function gridHeight(
  gridRows: number,
  bodyRows: number,
  rowH: number,
  input: Pick<GridInput, "yearH" | "rowGap">,
): number {
  return (
    gridRows * (input.yearH + (bodyRows + 2) * rowH) +
    (gridRows - 1) * input.rowGap
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
 * The grid for these months, `columns` × `gridRows` tables: the marks
 * fitted to the table width (fitMarks), as many body rows as the fullest
 * month, the rows as tall as the height allows, on the step scale, up to
 * maxRow. `fits` false when the marks or the rows do not fit (the caller
 * tries a smaller size).
 */
export function chooseGrid(input: GridInput): Grid {
  // The worst case of every address (profiles), never this one's own.
  const most = Math.max(
    input.least ?? 0,
    mostMarks(input) + (input.headroom ?? 0),
  );
  const { columns, gridRows } = input;
  const tableW = (input.width - input.gap * (columns - 1)) / columns;
  const fitted = fitMarks(tableW, most, input);
  const cell = fitted ?? {
    dateW: input.dateW,
    mark: input.mark,
    markGap: input.markGap,
  };
  const marksW = tableW - cell.dateW;
  const perLine = Math.max(
    1,
    Math.floor(
      (marksW - 2 * input.pad + cell.markGap) / (cell.mark + cell.markGap),
    ),
  );
  const bodyRows = Math.max(
    1,
    ...[
      ...input.months.map((month) => month.marks),
      ...(input.profiles ?? []),
    ].map((marks) => marks.reduce((sum, n) => sum + dateRows(n, perLine), 0)),
  );
  const unit = gridHeight(gridRows, bodyRows, 1, { yearH: 0, rowGap: 0 });
  const fixed = gridHeight(gridRows, bodyRows, 0, input);
  const raw = (input.height - fixed) / unit;
  const rowH = Math.min(
    input.maxRow,
    Math.floor(raw / input.rowStep) * input.rowStep,
  );
  return {
    columns,
    tableW,
    ...cell,
    perLine,
    bodyRows,
    rowH: Math.max(input.minRow, rowH),
    rows: tableRows(input.months, columns),
    fits: rowH >= input.minRow && fitted !== null && perLine >= most,
  };
}
