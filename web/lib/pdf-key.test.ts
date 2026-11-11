import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keyGrid } from "./pdf-key.ts";

const GAP = 12;
const rowCounts = (grid: ReturnType<typeof keyGrid>) =>
  Array.from(
    { length: grid.rows },
    (_, r) => grid.places.filter((p) => p.row === r).length,
  );

describe("keyGrid", () => {
  it("keeps the items on one line when they fit", () => {
    const grid = keyGrid([40, 50, 30], 200, GAP);
    assert.equal(grid.rows, 1);
    assert.deepEqual(
      grid.places.map((p) => p.x),
      [0, 52, 114],
    );
  });

  it("never leaves one item alone on a second line", () => {
    // Greedy wrapping would put the last item alone on line two.
    const widths = [60, 60, 60, 60, 60, 30];
    const room = 5 * 60 + 4 * GAP;
    const grid = keyGrid(widths, room, GAP);
    assert.equal(grid.rows, 2);
    assert.deepEqual(rowCounts(grid), [3, 3]);
  });

  it("aligns the second line's items with the first's columns", () => {
    const widths = [40, 90, 30, 70, 20];
    const grid = keyGrid(widths, 220, GAP);
    assert.equal(grid.rows, 2);
    const first = grid.places.filter((p) => p.row === 0).map((p) => p.x);
    for (const p of grid.places.filter((p) => p.row === 1)) {
      assert.ok(first.includes(p.x));
    }
    // Each column as wide as its widest item: nothing overlaps.
    grid.places.forEach((p, i) => {
      const next = grid.places[i + 1];
      if (next?.row === p.row) assert.ok(p.x + widths[i] + GAP <= next.x);
    });
  });

  it("fits within the room for every count of a worst-case set", () => {
    const all = [57, 33, 17, 34, 101, 147, 29, 96, 140, 70, 89, 100].map(
      (w) => w + 15,
    );
    for (let n = 1; n <= all.length; n++) {
      const widths = all.slice(0, n);
      const grid = keyGrid(widths, 463, GAP);
      const counts = rowCounts(grid);
      assert.ok(counts.every((c) => c > 0));
      const last = counts.at(-1) ?? 0;
      assert.ok(grid.rows === 1 || counts[0] === 1 || last >= 2, `n=${n}`);
      grid.places.forEach((p, i) => {
        assert.ok(p.x + widths[i] <= 463 || p.x === 0, `n=${n} item ${i}`);
      });
    }
  });

  it("lays out no items in one empty row", () => {
    assert.deepEqual(keyGrid([], 100, GAP), { rows: 1, places: [] });
  });
});
