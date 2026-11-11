import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseGrid,
  dateRows,
  fitMarks,
  type GridInput,
  gridHeight,
  headed,
  mostMarks,
  tableRows,
} from "./pdf-grid.ts";

const base: Omit<GridInput, "months"> = {
  width: 540,
  gap: 8,
  height: 480,
  yearH: 28,
  rowGap: 12,
  dateW: 44,
  minDateW: 28,
  minMarksW: 56,
  pad: 4,
  mark: 10,
  markGap: 4,
  minMarkGap: 2,
  minMark: 9,
  maxColumns: 6,
  minColumns: 2,
  maxRow: 20,
  minRow: 16,
  rowStep: 4,
};
const month = (key: string, marks: number[]) => ({ key, marks });
const year = (y: string, n: number, marks: number[]) =>
  Array.from({ length: n }, (_, i) =>
    month(`${y}-${String(i + 1).padStart(2, "0")}`, marks),
  );

test("the most columns whose marks column is wide enough, if the rows fit", () => {
  const grid = chooseGrid({ ...base, months: year("2027", 12, [3, 3]) });
  // Six columns leave (540 − 40) / 6 − 44 ≈ 39 for marks: under 56.
  assert.equal(grid.columns, 5);
  assert.equal(grid.fits, true);
  assert.equal(grid.rowH, 20);
});

test("every table gets the fullest month's body rows", () => {
  const grid = chooseGrid({
    ...base,
    months: [month("2027-01", [1]), month("2027-02", [3, 3, 3, 1])],
  });
  assert.equal(grid.bodyRows, 4);
});

test("each month sits under its own year: a year starts a new row", () => {
  const grid = chooseGrid({
    ...base,
    months: [
      month("2026-11", [1]),
      month("2026-12", [1]),
      ...year("2027", 8, [1]),
    ],
  });
  assert.equal(grid.columns, 5);
  assert.deepEqual(
    grid.rows.map((row) => [
      row.year,
      row.keys.every((key) => key.startsWith(row.year)),
      row.keys.length,
    ]),
    [
      ["2026", true, 2],
      ["2027", true, 5],
      ["2027", true, 3],
    ],
  );
  // A heading above the first row of each year only.
  assert.deepEqual(headed(grid.rows), [true, true, false]);
});

test("rows shrink in steps to fit, and the grid fits its height", () => {
  const months = year("2027", 12, [2, 2, 2, 2, 2, 2]);
  const grid = chooseGrid({ ...base, months, height: 470 });
  assert.equal(grid.rowH % base.rowStep, 0);
  assert.ok(grid.fits);
  assert.ok(gridHeight(grid.rows, grid.bodyRows, grid.rowH, base) <= 470);
});

test("no column count fits: the shortest grid, at the smallest rows", () => {
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
    { year: "2027", keys: ["2027-01", "2027-02"] },
  ]);
});

test("a date's marks never wrap: the date column narrows first, the table keeps its width", () => {
  // Five columns: 101.6 wide, 57.6 for marks beside a 44 date column, room
  // for three; a date of four, from another address, needs 2 × 4 + 4 × 10
  // + 3 × 4 = 60, so the date column takes the other 41.6.
  const months = year("2027", 12, [1, 1]);
  const grid = chooseGrid({ ...base, months, profiles: [[2, 4, 1]] });
  assert.equal(mostMarks({ months, profiles: [[2, 4, 1]] }), 4);
  assert.ok(grid.fits);
  assert.equal(grid.columns, 5);
  assert.equal(grid.tableW, (540 - 4 * 8) / 5);
  assert.deepEqual(
    [grid.dateW, grid.mark, grid.markGap, grid.perLine],
    [grid.tableW - 60, 10, 4, 4],
  );
  assert.equal(grid.bodyRows, 3);
});

test("past the narrowest date column, the marks close up, then shrink a little", () => {
  // 101.6 − 28 − 2 × 4 = 65.6 for the marks: five close up to
  // (65.6 − 50) / 4 = 3.9, in quarter points; the date column takes the
  // rest, so the marks keep their padding.
  assert.deepEqual(fitMarks(101.6, 5, base), {
    dateW: 101.6 - (8 + 50 + 15),
    mark: 10,
    markGap: 3.75,
  });
  // Six at the least gap: (65.6 − 5 × 2) / 6 = 9.27; seven would be under 9.
  assert.deepEqual(fitMarks(101.6, 6, base), {
    dateW: 101.6 - (8 + 55.5 + 10),
    mark: 9.25,
    markGap: 2,
  });
  assert.equal(fitMarks(101.6, 7, base), null);
  // Room beside the preferred date column: nothing changes.
  assert.deepEqual(fitMarks(101.6, 3, base), {
    dateW: 44,
    mark: 10,
    markGap: 4,
  });
});

test("no column count holds a date's marks on one line: the grid does not fit", () => {
  const grid = chooseGrid({ ...base, months: year("2027", 2, [30]) });
  assert.equal(grid.fits, false);
});

test("the worst case of every address sizes the tables: a sparse address gets the same", () => {
  // Every address's months (profiles) hold a date of five marks.
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
  const months = year("2027", 12, [3]);
  const exact = chooseGrid({ ...base, months });
  const roomy = chooseGrid({ ...base, months, headroom: 1 });
  assert.equal(exact.dateW, base.dateW);
  // Four marks need 2 × 4 + 4 × 10 + 3 × 4 = 60 of the table's 101.6.
  assert.equal(roomy.dateW, roomy.tableW - 60);
  assert.ok(roomy.perLine >= 4);
});
