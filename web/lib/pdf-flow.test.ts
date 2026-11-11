import assert from "node:assert/strict";
import { test } from "node:test";
import { flow, pack } from "./pdf-flow.ts";

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

test("tiles go into the column that ends highest, in order", () => {
  assert.deepEqual(pack([100, 40, 40, 40], 2, 10, 0, 0, 500), [
    { page: 0, column: 0, y: 0 },
    { page: 0, column: 1, y: 0 },
    { page: 0, column: 1, y: 50 },
    { page: 0, column: 1, y: 100 },
  ]);
});

test("a tile that fits in no column starts a new page", () => {
  const slots = pack([300, 300, 150], 2, 10, 100, 20, 450);
  assert.deepEqual(slots[2], { page: 1, column: 0, y: 20 });
});

test("a later, shorter tile fills a gap an earlier one left", () => {
  // The second tile needs a new page; the third still fits on the first.
  assert.deepEqual(pack([300, 380, 30], 1, 10, 100, 20, 450), [
    { page: 0, column: 0, y: 100 },
    { page: 1, column: 0, y: 20 },
    { page: 0, column: 0, y: 410 },
  ]);
});

test("a tile taller than a page gets a page of its own", () => {
  assert.deepEqual(pack([50, 900, 40], 2, 10, 100, 20, 450).slice(1), [
    { page: 1, column: 0, y: 20 },
    { page: 0, column: 1, y: 100 },
  ]);
  // Alone on an empty page it stays there: no endless new pages.
  assert.deepEqual(pack([900], 2, 10, 20, 20, 450), [
    { page: 0, column: 0, y: 20 },
  ]);
});
