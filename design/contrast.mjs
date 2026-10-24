#!/usr/bin/env node
// WCAG 2.x contrast check for the site's palette: GOV.UK's with the Wiśnia
// group, and every colour token in web/app/tokens.css. CI runs it (the web
// job's "Contrast" step). It exits 1 if a required pair fails, or if a colour
// token is in no text or UI pair and not in NOT_CHECKED with its reason.
// Usage: node design/contrast.mjs

import { readFileSync } from "node:fs";
import path from "node:path";

// Every custom property in web/app/tokens.css whose value is a colour: a hex,
// a colour function, a var() or a single keyword (a named colour, transparent,
// currentColor). Comments are skipped, so a commented-out token is not one.
const TOKENS = path.join(import.meta.dirname, "../web/app/tokens.css");
const COLOUR_VALUE =
  /^(#[0-9a-f]+|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.*\)|[a-z]+)$/is;
const problems = [];
const tokens = {};
for (const [, name, raw] of readFileSync(TOKENS, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) {
  const value = raw.trim();
  if (!COLOUR_VALUE.test(value)) continue;
  if (name in tokens)
    problems.push(`--${name} is declared twice in tokens.css`);
  tokens[name] = value;
}

// Colour tokens in no text or UI pair, each with why it needs none. Stale
// entries fail: one now in a checked pair, or one gone from tokens.css.
const NOT_CHECKED = new Map([
  [
    "waste-elektro-border",
    "transparent, so no outline: the dark waste-elektro fill is checked as UI",
  ],
  ["waste-zmieszane", "a fill: its waste-zmieszane-border outline is UI"],
  [
    "waste-plastik-metale",
    "a fill: its waste-plastik-metale-border outline is UI",
  ],
  ["waste-opony", "a fill: its waste-opony-border outline is UI"],
]);

// The bin colours. A fraction with an opaque -border token is drawn with that
// outline, which carries the non-text contrast (light yellow and light grey
// fills fade into the white page); a transparent one draws no outline, so the
// fill must carry it.
const WASTE = Object.keys(tokens)
  .filter((name) => /^waste-/.test(name) && !/-(border|print)$/.test(name))
  .map((name) => name.slice("waste-".length));
const OUTLINED = WASTE.filter(
  (w) => rgba(tokens[`waste-${w}-border`] ?? "")?.[3] === 1,
);
const PRINT = Object.keys(tokens).filter((name) =>
  /^waste-.*-print$/.test(name),
);

// Light only, as GOV.UK. GOV.UK Frontend 6.5.1's palette (functional colours
// and the colours its components use), with the brand-blue roles replaced by
// the Wiśnia group. Kept here, not parsed: the Wiśnia steps are computed
// by Sass in web/app/_palette.scss (and set in web/app/_settings.scss), and
// the rest are GOV.UK Frontend's own values.
const govuk = {
  text: "#0b0c0c",
  "secondary-text": "#484949",
  "inverse-text": "#ffffff",
  brand: "#6d2048",
  link: "#621d41",
  "link-hover": "#371024",
  "link-visited": "#621d41",
  "link-active": "#0b0c0c",
  border: "#cecece",
  "input-border": "#0b0c0c",
  "template-background": "#f8f4f6",
  "body-background": "#ffffff",
  focus: "#ffdd00",
  "focus-text": "#0b0c0c",
  error: "#ca3535",
  success: "#0f7a52",
  hover: "#cecece",
  "surface-background": "#f8f4f6",
  "surface-text": "#0b0c0c",
  "surface-border": "#b690a4",
  button: "#0f7a52",
  "button-hover": "#0b5c3e",
  "secondary-button": "#f3f3f3",
  // The header bar: Wiśnia shade-50, not the Generic header's black
  // ($app-header-colour in web/app/site.scss, task 88).
  "header-background": "#371024",
  // The header plate: GOV.UK white on the header's cherry (site.scss).
  "logo-plate": "#ffffff",
  // The plate on light backgrounds (footer, icons, share card): the header's
  // colour, PLATE_COLOUR in web/lib/logo.ts (task 88), with white "ul." cut out.
  "logo-plate-light": "#371024",
  // The plate on keyboard focus: currentColor, i.e. focus-text (app/site.scss).
  "logo-plate-focus": "#0b0c0c",
};
for (const name of Object.keys(tokens)) {
  if (name in govuk) problems.push(`--${name} shadows GOV.UK's ${name} here`);
}
const palette = { ...govuk, ...tokens };

// A colour as [r, g, b, alpha] (0–255, alpha 0–1), or null if this script
// cannot compute it (a named colour, currentColor, another colour function).
function rgba(value, seen = new Set()) {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    const hex = m[1].length <= 4 ? m[1].replace(/./g, "$&$&") : m[1];
    const [r, g, b, a = 255] = hex
      .match(/../g)
      .map((h) => Number.parseInt(h, 16));
    return [r, g, b, a / 255];
  }
  if (v === "transparent") return [0, 0, 0, 0];
  m = v.match(/^var\(\s*--([\w-]+)\s*(?:,(.*))?\)$/);
  if (m) {
    if (m[1] in tokens && !seen.has(m[1]))
      return rgba(tokens[m[1]], new Set(seen).add(m[1]));
    return m[2] ? rgba(m[2], seen) : null;
  }
  m = v.match(/^(rgb|hsl)a?\((.*)\)$/);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (p, scale) =>
    p.endsWith("%") ? (Number.parseFloat(p) / 100) * scale : Number(p);
  const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
  let rgb;
  if (m[1] === "rgb") {
    rgb = parts.slice(0, 3).map((p) => num(p, 255));
  } else {
    const h = Number(parts[0].replace(/deg$/, ""));
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;
    const a = s * Math.min(l, 1 - l);
    rgb = [0, 8, 4].map((n) => {
      const k = (n + h / 30) % 12;
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    });
  }
  const out = [...rgb, alpha];
  if (out.some((x) => !Number.isFinite(x))) return null;
  return out.map((x, i) => Math.min(Math.max(x, 0), i === 3 ? 1 : 255));
}

function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// A see-through foreground is composited over the (opaque) background.
function contrast(fg, bg) {
  const a = fg[3];
  const shown = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  const la = luminance(shown);
  const lb = luminance(bg);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// [foreground, background, kind]: "text" needs 4.5, "ui" needs 3, "info" is
// reported only (decorative, or paired with an edge that carries the contrast).
function requiredPairs() {
  const pairs = [
    ["text", "body-background", "text"],
    ["text", "template-background", "text"],
    ["secondary-text", "body-background", "text"],
    ["secondary-text", "template-background", "text"],
    ["inverse-text", "brand", "text"],
    ["link", "body-background", "text"],
    ["link", "template-background", "text"],
    ["link", "surface-background", "text"],
    ["link-hover", "body-background", "text"],
    ["link-active", "body-background", "text"],
    ["focus-text", "focus", "text"],
    ["error", "body-background", "text"],
    ["success", "body-background", "text"],
    ["inverse-text", "button", "text"],
    ["inverse-text", "button-hover", "text"],
    ["inverse-text", "error", "text"],
    ["text", "secondary-button", "text"],
    ["surface-text", "surface-background", "text"],
    ["inverse-text", "header-background", "text"],
    ["input-border", "body-background", "ui"],
    ["focus", "focus-text", "ui"],
    ["brand", "body-background", "ui"],
    ["logo-plate", "header-background", "ui"],
    ["logo-plate-focus", "focus", "ui"],
    ["inverse-text", "logo-plate-light", "ui"],
    ["logo-plate-light", "body-background", "ui"],
    ["logo-plate-light", "surface-background", "ui"],
    // The focus box on the header: no black bar under it (task 88), so the
    // yellow carries it against the cherry bar on its own.
    ["focus", "header-background", "ui"],
    ["focus", "body-background", "info"],
    ["border", "body-background", "info"],
    ["surface-border", "surface-background", "info"],
  ];
  for (const w of WASTE) {
    if (OUTLINED.includes(w)) {
      pairs.push([`waste-${w}-border`, "body-background", "ui"]);
      pairs.push([`waste-${w}`, "body-background", "info"]);
    } else {
      pairs.push([`waste-${w}`, "body-background", "ui"]);
    }
  }
  // Print outlines (the PDF's marks), on white paper.
  for (const name of PRINT) pairs.push([name, "body-background", "ui"]);
  return pairs;
}

const pairs = requiredPairs();
let failures = 0;
const lines = ["| Pair | Ratio | AA | AAA |", "| --- | ---: | --- | --- |"];
for (const [fg, bg, kind] of pairs) {
  const label = `${fg} ${kind === "text" ? "on" : "vs"} ${bg}`;
  const [f, b] = [rgba(palette[fg]), rgba(palette[bg])];
  if (!f || !b || b[3] !== 1) {
    failures++;
    lines.push(`| ${label} | ? | FAIL (cannot compute) | N/A |`);
    problems.push(
      `${label}: cannot compute ${fg}: ${palette[fg]} on ${bg}: ${palette[bg]} (use a hex, rgb() or hsl(), and an opaque background)`,
    );
    continue;
  }
  const ratio = contrast(f, b);
  const min = kind === "text" ? 4.5 : 3;
  const aa = ratio >= min;
  if (kind !== "info" && !aa) failures++;
  const aaa = kind === "text" ? (ratio >= 7 ? "pass" : "fail") : "N/A";
  const aaLabel = kind === "info" ? "n/a (see note)" : aa ? "pass" : "FAIL";
  lines.push(`| ${label} | ${ratio.toFixed(2)} | ${aaLabel} | ${aaa} |`);
}
console.log(lines.join("\n"));

const checked = new Set(
  pairs.filter(([, , kind]) => kind !== "info").flatMap(([fg, bg]) => [fg, bg]),
);
const names = Object.keys(tokens);
for (const name of names) {
  if (NOT_CHECKED.has(name) && checked.has(name))
    problems.push(
      `NOT_CHECKED: --${name} is in a checked pair now, remove it from the list`,
    );
  if (!NOT_CHECKED.has(name) && !checked.has(name))
    problems.push(
      `--${name}: ${tokens[name]} is a colour token in no text or UI pair: add a pair, or add it to NOT_CHECKED with the reason`,
    );
}
for (const name of NOT_CHECKED.keys()) {
  if (!(name in tokens))
    problems.push(
      `NOT_CHECKED: --${name} is not a colour token in tokens.css, remove it from the list`,
    );
}
const inPairs = names.filter((name) => checked.has(name)).length;
console.log(
  `\nColour tokens in tokens.css: ${names.length}; ${inPairs} in text or UI pairs, ${NOT_CHECKED.size} in NOT_CHECKED.`,
);
for (const problem of problems) console.error(problem);
if (failures > 0)
  console.error(`${failures} required pair(s) below threshold.`);
if (failures > 0 || problems.length > 0) process.exit(1);
