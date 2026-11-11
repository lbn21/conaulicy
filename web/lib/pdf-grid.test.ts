import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseGrid,
  dateRows,
  fitMarks,
  type GridInput,
  gridHeight,
  mostMarks,
  tableRows,
} from "./pdf-grid.ts";

const base: Omit<GridInput, "months"> = {
  width: 540,
  gap: 12,
  height: 480,
  yearH: 24,
  rowGap: 8,
  dateW: 44,
  minDateW: 28,
  minMarksW: 56,
  pad: 4,
  mark: 10,
  markGap: 4,
  minMarkGap: 2,
  minMark: 9,
  columns: 4,
  gridRows: 3,
  maxRow: 20,
  minRow: 16,
  rowStep: 4,
};
const month = (key: string, marks: number[]) => ({ key, marks });
const year = (y: string, n: number, marks: number[], from = 1) =>
  Array.from({ length: n }, (_, i) =>
    month(`${y}-${String(i + from).padStart(2, "0")}`, marks),
  );

test("a fixed grid: the columns' width from the page, the given rows", () => {
  const grid = chooseGrid({ ...base, months: year("2027", 12, [3, 3]) });
  assert.equal(grid.columns, 4);
  assert.equal(grid.tableW, (540 - 3 * 12) / 4);
  assert.equal(grid.rows.length, 3);
  assert.ok(grid.rows.every((row) => row.keys.length === 4));
  assert.equal(grid.fits, true);
});

test("every table gets the fullest month's body rows", () => {
  const grid = chooseGrid({
    ...base,
    months: [month("2027-01", [1]), month("2027-02", [3, 3, 3, 1])],
  });
  assert.equal(grid.bodyRows, 4);
});

test("a year never breaks a row: its heading sits above its first month", () => {
  // November to October: 2026's two months and 2027's ten, three rows.
  const months = [...year("2026", 2, [1], 11), ...year("2027", 10, [1])];
  const rows = tableRows(months, 4);
  assert.deepEqual(
    rows.map((row) => row.keys.length),
    [4, 4, 4],
  );
  assert.deepEqual(
    rows.map((row) => row.years),
    [
      [
        { column: 0, year: "2026" },
        { column: 2, year: "2027" },
      ],
      [],
      [],
    ],
  );
});

test("the height: a year strip above every row, whatever the years", () => {
  // Three strips of 24, three tables of (2 + 4) × 16, two gaps of 8.
  assert.equal(gridHeight(3, 4, 16, base), 3 * 24 + 3 * 6 * 16 + 2 * 8);
});

test("rows shrink in steps to fit, and the grid fits its height", () => {
  const months = year("2027", 12, [2, 2, 2, 2, 2, 2]);
  // 3 × 24 + 2 × 8 fixed, 3 × 8 rows: (520 − 88) / 24 = 18, down to 16.
  const grid = chooseGrid({ ...base, months, height: 520 });
  assert.equal(grid.rowH, 16);
  assert.ok(grid.fits);
  assert.ok(gridHeight(3, grid.bodyRows, grid.rowH, base) <= 520);
});

test("too many rows for the height: it does not fit, at the smallest rows", () => {
  const grid = chooseGrid({
    ...base,
    months: year("2027", 12, Array(20).fill(1)),
  });
  assert.equal(grid.fits, false);
  assert.equal(grid.rowH, base.minRow);
});

test("a date with more marks than a row holds takes more rows", () => {
  assert.equal(dateRows(0, 3), 1);
  assert.equal(dateRows(3, 3), 1);
  assert.equal(dateRows(4, 3), 2);
});

test("other addresses' months size the tables: fewer months, the same grid", () => {
  const fullest = [1, 1, 1, 1, 1, 1];
  const window = year("2027", 12, []);
  const full = chooseGrid({ ...base, months: window, profiles: [fullest] });
  const two = chooseGrid({
    ...base,
    months: window.map((m, i) => (i < 2 ? { ...m, marks: [1] } : m)),
    profiles: [fullest],
  });
  assert.equal(full.bodyRows, fullest.length);
  assert.deepEqual(
    [two.columns, two.tableW, two.rowH, two.bodyRows],
    [full.columns, full.tableW, full.rowH, full.bodyRows],
  );
  // Placed from the top left, in the grid's columns.
  assert.deepEqual(tableRows(window.slice(0, 2), full.columns), [
    { keys: ["2027-01", "2027-02"], years: [{ column: 0, year: "2027" }] },
  ]);
});

test("a date's marks never wrap: the date column narrows, the table keeps its width", () => {
  // 126 wide: 82 for marks beside a 44 date column holds six; a date of
  // seven needs 2 × 4 + 7 × 10 + 6 × 4 = 102, so the date column takes 24,
  // under its least (28): the marks close up instead.
  const months = year("2027", 12, [1, 1]);
  const grid = chooseGrid({ ...base, months, profiles: [[2, 7, 1]] });
  assert.equal(mostMarks({ months, profiles: [[2, 7, 1]] }), 7);
  assert.ok(grid.fits);
  assert.equal(grid.tableW, 126);
  assert.ok(grid.perLine >= 7);
  assert.ok(grid.dateW >= base.minDateW);
});

test("past the narrowest date column, the marks close up, then shrink, to the caller's least", () => {
  // 101.6 − 28 − 2 × 4 = 65.6 for the marks: five close up to
  // (65.6 − 50) / 4 = 3.9, in quarter points.
  assert.deepEqual(fitMarks(101.6, 5, base), {
    dateW: 101.6 - (8 + 50 + 15),
    mark: 10,
    markGap: 3.75,
  });
  // The PDF's least is its own size and gap: then they do not fit.
  assert.equal(
    fitMarks(101.6, 5, { ...base, minMarkGap: 4, minMark: 10 }),
    null,
  );
  // Room beside the preferred date column: nothing changes.
  assert.deepEqual(fitMarks(101.6, 3, base), {
    dateW: 44,
    mark: 10,
    markGap: 4,
  });
});

test("room for the least marks a date may have, whatever the data", () => {
  const months = year("2027", 12, [2]);
  const grid = chooseGrid({
    ...base,
    months,
    least: 5,
    minMarkGap: 4,
    minMark: 10,
  });
  assert.ok(grid.fits);
  assert.ok(grid.perLine >= 5);
  // Five need 2 × 4 + 5 × 10 + 4 × 4 = 74: beside the 44 date column (82).
  assert.equal(grid.dateW, base.dateW);
  // Seven need 102: the date column narrows to 24, under its least.
  assert.equal(
    chooseGrid({ ...base, months, least: 7, minMarkGap: 4, minMark: 10 }).fits,
    false,
  );
});

test("the worst case of every address sizes the tables: a sparse address gets the same", () => {
  const profiles = [
    [5, 1],
    [2, 2, 2],
  ];
  const sparse = chooseGrid({
    ...base,
    months: year("2027", 2, [1]),
    profiles,
  });
  const worst = chooseGrid({
    ...base,
    months: year("2027", 12, [5, 1]),
    profiles,
  });
  const geometry = (g: typeof sparse) => [
    g.columns,
    g.tableW,
    g.dateW,
    g.mark,
    g.markGap,
    g.perLine,
    g.bodyRows,
    g.rowH,
  ];
  assert.ok(worst.fits && worst.perLine >= 5);
  assert.deepEqual(geometry(sparse), geometry(worst));
});

test("headroom: room for one mark more than the data's fullest date", () => {
  const months = year("2027", 12, [6]);
  const exact = chooseGrid({ ...base, months });
  const roomy = chooseGrid({ ...base, months, headroom: 1 });
  // Six need 2 × 4 + 6 × 10 + 5 × 4 = 88: the date column narrows to 38.
  assert.equal(exact.dateW, 126 - 88);
  // Seven need 102, past the least date column: they close up.
  assert.ok(roomy.perLine >= 7);
});
