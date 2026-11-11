import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseGrid,
  dateRows,
  type GridInput,
  gridHeight,
  headed,
} from "./pdf-grid.ts";

const base: Omit<GridInput, "months"> = {
  width: 540,
  gap: 8,
  height: 480,
  yearH: 28,
  rowGap: 12,
  dateW: 44,
  minMarksW: 56,
  pad: 4,
  mark: 10,
  markGap: 4,
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
