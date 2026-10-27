import assert from "node:assert/strict";
import { test } from "node:test";
import { group, PRIMARY } from "./palette.ts";

test("GOV.UK's method on #1d70b8 gives GOV.UK's blue group", () => {
  // govuk-frontend 6.5.1, settings/_colours-palette--internal.scss.
  assert.deepEqual(group("#1d70b8"), {
    primary: "#1d70b8",
    "tint-25": "#5694ca",
    "tint-50": "#8eb8dc",
    "tint-80": "#d2e2f1",
    "tint-95": "#f4f8fb",
    "shade-10": "#1a65a6",
    "shade-25": "#16548a",
    "shade-50": "#0f385c",
  });
});

test("our primary in the same steps: each tint lighter, each shade darker", () => {
  // Relative luminance (WCAG): the steps keep GOV.UK's order on our colour.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ours = group(PRIMARY);
  assert.equal(ours.primary, PRIMARY);
  const order = [
    "tint-95",
    "tint-80",
    "tint-50",
    "tint-25",
    "primary",
    "shade-10",
    "shade-25",
    "shade-50",
  ] as const;
  for (let i = 1; i < order.length; i++)
    assert.ok(
      luminance(ours[order[i - 1]]) > luminance(ours[order[i]]),
      `${order[i - 1]} > ${order[i]}`,
    );
});
