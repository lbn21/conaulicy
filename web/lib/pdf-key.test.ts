import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KEY_COLUMNS, KEY_ROWS, keyCell, keyGrid } from "./pdf-key.ts";

const GAP = 12;

describe("keyGrid", () => {
  it("is one grid for any address: equal cells, as wide as the widest item", () => {
    const widths = [72, 48, 32, 49, 162, 44];
    const grid = keyGrid(widths, 6, 540, GAP);
    assert.equal(grid.columns, KEY_COLUMNS);
    assert.equal(grid.rows, KEY_ROWS);
    assert.equal(grid.cellW, Math.max(...widths));
    assert.deepEqual(grid.x, [0, 174, 348]);
    assert.ok(grid.fits);
  });

  it("keeps its rows for an address with fewer items", () => {
    const grid = keyGrid([72, 162], 1, 540, GAP);
    assert.equal(grid.rows, KEY_ROWS);
    assert.equal(grid.columns, KEY_COLUMNS);
  });

  it("fills the cells row by row, left to right", () => {
    const grid = keyGrid([100], 6, 540, GAP);
    const cells = Array.from({ length: 6 }, (_, i) => keyCell(grid, i));
    assert.deepEqual(
      cells.map((c) => c.row),
      [0, 0, 0, 1, 1, 1],
    );
    assert.deepEqual(
      cells.map((c) => c.x),
      [0, 112, 224, 0, 112, 224],
    );
  });

  it("takes more rows, never narrower cells, for more items", () => {
    const grid = keyGrid([100], 7, 540, GAP);
    assert.equal(grid.rows, 3);
    assert.equal(grid.cellW, 100);
  });

  it("says when its columns do not fit", () => {
    assert.equal(keyGrid([162], 6, 463, GAP).fits, false);
  });
});
