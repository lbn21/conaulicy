import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEY_ORDER,
  keyCell,
  keyGrid,
  keyOrder,
  windowKeys,
} from "./pdf-key.ts";

const GAP = 12;

describe("keyGrid", () => {
  it("takes the most equal columns whose cells hold the widest item", () => {
    const grid = keyGrid(540, GAP, 162, 10);
    assert.equal(grid.columns, 3);
    assert.ok(grid.cellW >= 162);
    assert.ok(keyGrid(540, GAP, 120, 10).columns > 3);
    assert.equal(grid.rows, 4);
  });

  it("spans the room, the last cell ending at its edge", () => {
    const grid = keyGrid(540, GAP, 100, 10);
    grid.x.forEach((x, c) => {
      assert.equal(x, c * (grid.cellW + GAP));
    });
    const last = grid.x[grid.columns - 1];
    assert.ok(Math.abs(last + grid.cellW - 540) < 1e-9);
  });

  it("never more columns than items", () => {
    assert.equal(keyGrid(540, GAP, 20, 2).columns, 2);
  });

  it("fills the cells row by row, left to right", () => {
    const grid = keyGrid(540, GAP, 162, 10);
    const rows = Array.from({ length: 7 }, (_, i) => keyCell(grid, i).row);
    assert.deepEqual(rows, [0, 0, 0, 1, 1, 1, 2]);
    assert.equal(keyCell(grid, 3).x, grid.x[0]);
  });
});

describe("keyOrder", () => {
  it("is the key's fixed order, whatever order the data gives", () => {
    assert.deepEqual(keyOrder([...KEY_ORDER].reverse()), KEY_ORDER);
  });
});

describe("windowKeys", () => {
  it("is each zone's key in every window of the span, from each month", () => {
    const zone = new Map<string, string[]>([
      ["2026-11", ["zmieszane"]],
      ["2027-03", ["wielkogabarytowe"]],
      ["2027-05", ["bio"]],
    ]);
    const keys = windowKeys([zone], 6);
    // Nov–Apr, Mar–Aug, May–Oct.
    assert.deepEqual(keys, [
      ["zmieszane", "wielkogabarytowe"],
      ["bio", "wielkogabarytowe"].sort(
        (a, b) => KEY_ORDER.indexOf(a) - KEY_ORDER.indexOf(b),
      ),
      ["bio"],
    ]);
  });

  it("never mixes zones", () => {
    const keys = windowKeys([
      new Map([["2026-11", ["zmieszane"]]]),
      new Map([["2026-11", ["bio"]]]),
    ]);
    assert.deepEqual(keys, [["zmieszane"], ["bio"]]);
  });
});
