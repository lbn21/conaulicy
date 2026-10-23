#!/usr/bin/env node
// WCAG 2.x contrast check for the site's palette: GOV.UK's with the Latarnia
// group, and the bin colours from web/app/tokens.css.
// Usage: node design/contrast.mjs

import { readFileSync } from "node:fs";
import path from "node:path";

// The bin colours as the site has them: every --waste-* custom property in
// web/app/tokens.css. A fraction with a colour -border token is drawn with
// that outline, which carries the non-text contrast (light yellow and light
// grey fills fade into the white page).
const TOKENS = path.join(import.meta.dirname, "../web/app/tokens.css");
const waste = Object.fromEntries(
  [
    ...readFileSync(TOKENS, "utf8").matchAll(
      /--(waste-[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi,
    ),
  ].map(([, name, hex]) => [name, hex.toLowerCase()]),
);
const WASTE = Object.keys(waste)
  .filter((name) => !/-(border|print)$/.test(name))
  .map((name) => name.slice("waste-".length));
const OUTLINED = WASTE.filter((w) => `waste-${w}-border` in waste);
const PRINT = Object.keys(waste).filter((name) => name.endsWith("-print"));

// Light only, as GOV.UK. GOV.UK Frontend 6.5.1's palette (functional colours
// and the colours its components use), with the brand-blue roles replaced by
// the Latarnia group. Kept here, not parsed: the Latarnia steps are computed
// by Sass in web/app/_palette.scss (and set in web/app/_settings.scss), and
// the rest are GOV.UK Frontend's own values.
const palette = {
  text: "#0b0c0c",
  "secondary-text": "#484949",
  "inverse-text": "#ffffff",
  brand: "#9a5700",
  link: "#8b4e00",
  "link-hover": "#4d2c00",
  "link-visited": "#8b4e00",
  "link-active": "#0b0c0c",
  border: "#cecece",
  "input-border": "#0b0c0c",
  "template-background": "#faf7f2",
  "body-background": "#ffffff",
  focus: "#ffdd00",
  "focus-text": "#0b0c0c",
  error: "#ca3535",
  success: "#0f7a52",
  hover: "#cecece",
  "surface-background": "#faf7f2",
  "surface-text": "#0b0c0c",
  "surface-border": "#cdab80",
  button: "#0f7a52",
  "button-hover": "#0b5c3e",
  "secondary-button": "#f3f3f3",
  "header-background": "#0b0c0c",
  "logo-plate": "#ffb547",
  ...waste,
};

function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
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

let failures = 0;
const lines = ["| Pair | Ratio | AA | AAA |", "| --- | ---: | --- | --- |"];
for (const [fg, bg, kind] of requiredPairs()) {
  const ratio = contrast(palette[fg], palette[bg]);
  const min = kind === "text" ? 4.5 : 3;
  const aa = ratio >= min;
  if (kind !== "info" && !aa) failures++;
  const aaa = kind === "text" ? (ratio >= 7 ? "pass" : "fail") : "N/A";
  const label = `${fg} ${kind === "text" ? "on" : "vs"} ${bg}`;
  const aaLabel = kind === "info" ? "n/a (see note)" : aa ? "pass" : "FAIL";
  lines.push(`| ${label} | ${ratio.toFixed(2)} | ${aaLabel} | ${aaa} |`);
}
console.log(lines.join("\n"));
if (failures > 0) {
  console.error(`${failures} required pair(s) below threshold.`);
  process.exit(1);
}
