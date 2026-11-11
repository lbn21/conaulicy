import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEY_COLUMNS,
  KEY_LABELS,
  KEY_ROWS,
  keyCell,
  keyGrid,
  keyOrder,
} from "./pdf-key.ts";
import { FRACTIONS, tones } from "./waste-bin.ts";

const GAP = 12;

describe("keyGrid", () => {
  it("is equal cells across the room, the same for any address", () => {
    const grid = keyGrid(540, GAP, 3);
    assert.equal(grid.columns, KEY_COLUMNS);
    assert.equal(grid.rows, KEY_ROWS);
    assert.equal(grid.cellW, (540 - (KEY_COLUMNS - 1) * GAP) / KEY_COLUMNS);
    grid.x.forEach((x, c) => {
      assert.equal(x, c * (grid.cellW + GAP));
    });
    assert.ok(
      Math.abs(grid.x[KEY_COLUMNS - 1] + grid.cellW - 540) < 1e-9,
      "the last cell ends at the room's edge",
    );
  });

  it("holds every listed fraction in its rows", () => {
    assert.ok(KEY_LABELS.length <= KEY_COLUMNS * KEY_ROWS);
    assert.equal(keyGrid(540, GAP, KEY_LABELS.length).rows, KEY_ROWS);
  });

  it("fills the cells row by row, left to right", () => {
    const grid = keyGrid(540, GAP, 10);
    const rows = Array.from({ length: 10 }, (_, i) => keyCell(grid, i).row);
    assert.deepEqual(rows, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    assert.equal(keyCell(grid, 5).x, grid.x[0]);
  });

  it("takes more rows, never narrower cells, for more items", () => {
    const grid = keyGrid(540, GAP, 11);
    assert.equal(grid.rows, 3);
    assert.equal(grid.cellW, keyGrid(540, GAP, 1).cellW);
  });
});

describe("keyOrder", () => {
  it("is the key's fixed order, whatever order the data gives", () => {
    const listed = KEY_LABELS.map((k) => k.subtype);
    assert.deepEqual(keyOrder([...listed].reverse()), listed);
  });

  it("names every fraction the data's subtypes split into", () => {
    // Every tone but plain „tworzywa”, which no schedule uses (the data's
    // plastics are tworzywa_metale).
    const listed = new Set(KEY_LABELS.map((k) => k.subtype));
    for (const { subtype } of FRACTIONS) {
      for (const tone of tones(subtype)) {
        if (tone !== "tworzywa") assert.ok(listed.has(tone), tone);
      }
    }
  });
});
