import assert from "node:assert/strict";
import { test } from "node:test";
import { flow } from "./pdf-flow.ts";

const month = (n: number) => ({ head: 30, lines: Array(n).fill(20), gap: 6 });

test("months that fit stay on the page", () => {
  const placed = flow([month(2), month(3)], 100, 50, 400);
  assert.deepEqual(
    placed.map((p) => p.head),
    [
      { page: 0, y: 100 },
      { page: 0, y: 176 },
    ],
  );
  assert.deepEqual(placed[1].lines.at(-1), { page: 0, y: 246 });
});

test("a month that does not fit moves whole to the next page", () => {
  // The second month needs 30 + 3 × 20 = 90; only 74 are left.
  const placed = flow([month(10), month(3)], 100, 50, 400);
  assert.deepEqual(placed[1].head, { page: 1, y: 50 });
  assert.ok(placed[1].lines.every((spot) => spot.page === 1));
  assert.deepEqual(placed[1].continued, []);
});

test("a month longer than a page repeats its heading", () => {
  // 30 + 20 × 20 = 430 > 350 a page holds.
  const [placed] = flow([month(20)], 100, 50, 400);
  assert.equal(placed.head.page, 0);
  assert.deepEqual(placed.continued, [{ page: 1, y: 50 }]);
  const first = placed.lines.findIndex((spot) => spot.page === 1);
  assert.deepEqual(placed.lines[first], { page: 1, y: 80 });
  assert.ok(placed.lines.every((spot) => spot.y + 20 <= 400));
});

test("a long month never leaves its heading alone at a page's end", () => {
  const [, placed] = flow([month(12), month(20)], 100, 50, 400);
  assert.equal(placed.head.page, placed.lines[0].page);
});
