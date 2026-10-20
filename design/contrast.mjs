#!/usr/bin/env node
// WCAG 2.x contrast check for the Latarnia token set (design/tokens.css).
// Usage: node design/contrast.mjs

const WASTE = [
  "zmieszane",
  "papier",
  "plastik-metale",
  "szklo",
  "bio",
  "popiol",
  "gabaryty",
  "elektro",
  "opony",
  "tekstylia",
];

// Fractions drawn with an outline token. The outline carries the non-text
// contrast: light yellow and light grey fills fade into the white page.
const OUTLINED = ["zmieszane", "plastik-metale", "opony"];
// Light only, as GOV.UK. GOV.UK Frontend 6.5.1's palette (functional colours
// and the colours its components use), with the brand-blue roles replaced by
// the Latarnia group (web/app/_palette.scss); then the bin colours.
const palette = {
  text: "#0b0c0c",
  "secondary-text": "#484949",
  "inverse-text": "#ffffff",
  brand: "#9a5700",
  link: "#8b4e00",
  "link-hover": "#4d2c00",
  "link-visited": "#54319f",
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
    "waste-zmieszane": "#111111",
    "waste-zmieszane-fg": "#ffffff",
    "waste-zmieszane-border": "#111111",
    "waste-papier": "#1f63c7",
    "waste-papier-fg": "#ffffff",
    "waste-plastik-metale": "#f2c200",
    "waste-plastik-metale-fg": "#161b24",
    "waste-plastik-metale-border": "#7d6200",
    "waste-szklo": "#1e7f4f",
    "waste-szklo-fg": "#ffffff",
    "waste-bio": "#7a4b2a",
    "waste-bio-fg": "#ffffff",
    "waste-popiol": "#5c6370",
    "waste-popiol-fg": "#ffffff",
    "waste-gabaryty": "#c2410c",
    "waste-gabaryty-fg": "#ffffff",
    "waste-elektro": "#1e3a8a",
    "waste-elektro-fg": "#ffffff",
    "waste-opony": "#a3aab5",
    "waste-opony-fg": "#161b24",
    "waste-opony-border": "#4a5160",
    "waste-tekstylia": "#a8336a",
    "waste-tekstylia-fg": "#ffffff",
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
    ["link-visited", "body-background", "text"],
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
    pairs.push([`waste-${w}-fg`, `waste-${w}`, "text"]);
  }
  for (const w of WASTE) {
    if (OUTLINED.includes(w)) {
      pairs.push([`waste-${w}-border`, "body-background", "ui"]);
      pairs.push([`waste-${w}`, "body-background", "info"]);
    } else {
      pairs.push([`waste-${w}`, "body-background", "ui"]);
    }
  }
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
