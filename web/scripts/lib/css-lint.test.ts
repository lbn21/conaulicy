import assert from "node:assert/strict";
import { test } from "node:test";
import { lintCss, lintMarkup } from "./css-lint.mjs";

const rules = (source: string) =>
  lintCss(source, "x.scss").failures.map((f: { rule: string }) => f.rule);

test("each hack trips its rule", () => {
  assert.deepEqual(rules(".a { vertical-align: -.2em; }"), ["R1", "R7"]);
  assert.deepEqual(rules(".a { vertical-align: top; }"), ["R1"]);
  assert.deepEqual(rules(".a { position: relative; top: -2px; }"), [
    "R2",
    "R7",
  ]);
  assert.deepEqual(rules(".a { position: absolute; left: $x; }"), ["R2"]);
  // A pseudo-element is no exception (t370).
  assert.deepEqual(
    rules(".a::after { position: absolute; top: calc(50% - #{$x}); }"),
    ["R2"],
  );
  assert.deepEqual(
    rules(
      ".a { position: relative; &::after { position: absolute; inset: calc(100% + #{$x}) 0 auto; } }",
    ),
    ["R2"],
  );
  assert.deepEqual(rules(".a { margin: -(govuk-spacing(4)) 0; }"), ["R3"]);
  assert.deepEqual(rules(".a { margin-left: -$app-hair; }"), ["R3"]);
  assert.deepEqual(rules(".a { transform: translateY(1px); }"), ["R4", "R7"]);
  assert.deepEqual(rules(".a { line-height: 1.2; }"), ["R5"]);
  assert.deepEqual(rules(".a { min-height: 35px; }"), ["R6", "R7"]);
  assert.deepEqual(rules(".a { gap: 1rem; }"), ["R7"]);
  assert.deepEqual(rules("$x: 18px;"), ["R7"]);
  assert.deepEqual(rules(".a { @include mixin($top: 18px); }"), ["R7"]);
  assert.deepEqual(rules(".a { width: 2em; }"), ["R7"]);
  assert.deepEqual(rules(".a { height: 2lh; }"), ["R7"]);
  assert.deepEqual(rules(".a { color: red !important; }"), ["R8"]);
});

test("tokens, keywords, flex and decoration pass", () => {
  const clean = `
    .a { vertical-align: middle; margin: 0 0 govuk-spacing(6); line-height: 1.5; }
    .a { --y: calc(#{$app-hair + govuk-spacing(3)} + .5lh); height: 1lh; }
    .app-icon { width: 1.25em; height: 1.25em; }
    .app-bin--small { height: 1.25em; }
    .a { position: relative; &::after { position: absolute; inset: 0; } }
    .a::before { content: ""; position: fixed; inset: 0 0 auto; }
    .a { transform: rotate(45deg); animation: x 1.6s; inset: 0 0 auto; }
    @keyframes x { 50% { opacity: .55; } }
    // a comment with 3px and !important in it
    /* and 2px here */
    :root { --licence: "a // b 4px"; }
  `;
  assert.deepEqual(rules(clean), []);
});

test("css-allow covers the next declaration only, with a reason", () => {
  const ok = lintCss(
    ".a {\n  // css-allow R1: centres the icon on a wrapping line\n  vertical-align: top;\n  vertical-align: bottom;\n}",
    "x.scss",
  );
  assert.equal(ok.allowed.length, 1);
  assert.deepEqual(
    ok.failures.map((f: { rule: string }) => f.rule),
    ["R1"],
  );
  // Too short a reason, a rule not broken, a tag over nothing: R10.
  assert.deepEqual(
    rules(".a {\n  // css-allow R1: short\n  vertical-align: top;\n}"),
    ["R10"],
  );
  assert.deepEqual(
    rules(
      ".a {\n  // css-allow R3: no negative margin is here at all\n  gap: 0;\n}",
    ),
    ["R10"],
  );
  assert.deepEqual(
    rules(".a { gap: 0; }\n// css-allow R1: nothing comes after this one"),
    ["R10"],
  );
});

test("R9: inline styles in markup", () => {
  assert.equal(lintMarkup('<p style={{ color: "red" }}>', "x.tsx").length, 1);
  assert.equal(lintMarkup('<p className="govuk-body">', "x.tsx").length, 0);
});
