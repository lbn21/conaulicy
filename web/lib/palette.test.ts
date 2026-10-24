import assert from "node:assert/strict";
import { test } from "node:test";
import { compileString } from "sass";
import { group, PALETTE, PRIMARY } from "./palette.ts";

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

test("each step is Sass's color.mix, as the Sass had it before", () => {
  const steps = Object.entries(PALETTE).filter(([step]) => step !== "primary");
  const css = compileString(
    `@use "sass:color";\n${steps
      .map(([step]) => {
        const [kind, weight] = step.split("-");
        const withHex = kind === "tint" ? "#ffffff" : "#000000";
        return `.${step} { c: color.ie-hex-str(color.mix(${withHex}, ${PRIMARY}, ${weight}%)); }`;
      })
      .join("\n")}`,
    { silenceDeprecations: ["color-functions"] },
  ).css;
  for (const [step, hex] of steps)
    assert.match(
      css,
      new RegExp(`\\.${step} \\{\\s*c: #FF${hex.slice(1).toUpperCase()};`),
      step,
    );
});
