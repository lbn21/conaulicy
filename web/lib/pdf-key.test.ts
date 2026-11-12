import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEY_ORDER,
  KEY_TOKENS,
  keyCell,
  keyGrid,
  keyOrder,
  keyTokens,
} from "./pdf-key.ts";
import {
  FRACTIONS,
  TOKEN,
  tokenLabel,
  tokenSubtype,
  tones,
} from "./waste-bin.ts";

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

describe("keyTokens", () => {
  it("gives fractions sharing a colour token one entry", () => {
    const shared = FRACTIONS.map(({ subtype }) => subtype).filter((s, _, all) =>
      all.some((o) => o !== s && TOKEN[o] === TOKEN[s]),
    );
    assert.ok(shared.length > 1, "the site has fractions sharing a token");
    assert.deepEqual(keyTokens(shared), [
      ...new Set(shared.map((s) => TOKEN[s])),
    ]);
  });

  it("splits a combined subtype into its fractions' tokens", () => {
    for (const { subtype } of FRACTIONS) {
      assert.deepEqual(
        new Set(keyTokens([subtype])),
        new Set(tones(subtype).map((t) => TOKEN[t])),
      );
    }
  });
});

describe("KEY_TOKENS", () => {
  it("is every colour token the site knows, once, in the key's order", () => {
    const all = new Set(
      FRACTIONS.flatMap(({ subtype }) => tones(subtype)).map((t) => TOKEN[t]),
    );
    assert.equal(KEY_TOKENS.length, all.size);
    assert.deepEqual(new Set(KEY_TOKENS), all);
    assert.deepEqual(keyOrder(KEY_TOKENS), KEY_TOKENS);
  });

  it("fewer entries than fractions where fractions share a token", () => {
    const fractions = new Set(
      FRACTIONS.flatMap(({ subtype }) => tones(subtype)),
    );
    assert.ok(KEY_TOKENS.length < fractions.size);
  });

  it("names each entry by its token: one name, no two alike", () => {
    const names = KEY_TOKENS.map(tokenLabel);
    assert.equal(new Set(names).size, names.length);
    for (const token of KEY_TOKENS) {
      const subtype = tokenSubtype(token);
      assert.equal(TOKEN[subtype], token);
      assert.equal(
        tokenLabel(token),
        FRACTIONS.find((f) => f.subtype === subtype)?.label,
      );
    }
  });
});
