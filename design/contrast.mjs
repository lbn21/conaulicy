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
];

// Fractions drawn with an outline token, per theme. The outline carries the
// non-text contrast. Dark yellow is bright enough on its own, so its border
// token is transparent there.
const OUTLINED = {
  dark: ["zmieszane"],
  light: ["zmieszane", "plastik-metale"],
};

const palettes = {
  dark: {
    background: "#10141d",
    surface: "#19202b",
    "surface-2": "#212937",
    text: "#e9edf2",
    "text-muted": "#b4bcc8",
    border: "#6f7a8d",
    accent: "#ffb547",
    "accent-contrast": "#10141d",
    secondary: "#262e3b",
    focus: "#ffdda0",
    success: "#6fd49a",
    warning: "#f2a65a",
    danger: "#ff8f85",
    "waste-zmieszane": "#111111",
    "waste-zmieszane-fg": "#f5f7fa",
    "waste-zmieszane-border": "#9aa3b2",
    "waste-papier": "#6eb4ff",
    "waste-papier-fg": "#10141d",
    "waste-plastik-metale": "#f4d35e",
    "waste-plastik-metale-fg": "#10141d",
    "waste-szklo": "#58d39a",
    "waste-szklo-fg": "#10141d",
    "waste-bio": "#c4936a",
    "waste-bio-fg": "#10141d",
    "waste-popiol": "#c4c8ce",
    "waste-popiol-fg": "#10141d",
    "waste-gabaryty": "#f293b8",
    "waste-gabaryty-fg": "#10141d",
  },
  light: {
    background: "#f5f7fa",
    surface: "#ffffff",
    "surface-2": "#eef1f5",
    text: "#161b24",
    "text-muted": "#4a5568",
    border: "#6f7a8d",
    accent: "#9a5700",
    "accent-contrast": "#ffffff",
    secondary: "#e8ecf2",
    focus: "#6b3d00",
    success: "#1e7a46",
    warning: "#a0420a",
    danger: "#b42318",
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
    "waste-gabaryty": "#a8336a",
    "waste-gabaryty-fg": "#ffffff",
  },
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

// [foreground, background, kind] — kind "text" needs 4.5, "ui" needs 3.
function requiredPairs(theme) {
  const pairs = [];
  for (const bg of ["background", "surface", "surface-2", "secondary"]) {
    pairs.push(["text", bg, "text"]);
  }
  for (const bg of ["background", "surface", "surface-2"]) {
    pairs.push(["text-muted", bg, "text"]);
  }
  pairs.push(["accent-contrast", "accent", "text"]);
  for (const status of ["success", "warning", "danger"]) {
    for (const bg of ["background", "surface"]) {
      pairs.push([status, bg, "text"]);
    }
  }
  for (const bg of ["background", "surface", "surface-2"]) {
    pairs.push(["border", bg, "ui"]);
  }
  for (const bg of ["background", "surface"]) {
    pairs.push(["focus", bg, "ui"]);
  }
  pairs.push(["accent", "background", "ui"]);
  for (const w of WASTE) {
    pairs.push([`waste-${w}-fg`, `waste-${w}`, "text"]);
  }
  for (const w of WASTE) {
    if (OUTLINED[theme].includes(w)) {
      // Near-black (dark theme) and bright yellow (light theme) fills fade into
      // the background; the outline is the 3:1 edge.
      pairs.push([`waste-${w}-border`, "background", "ui"]);
      pairs.push([`waste-${w}`, "background", "info"]);
    } else {
      pairs.push([`waste-${w}`, "background", "ui"]);
    }
  }
  return pairs;
}

let failures = 0;
const lines = [];

for (const [theme, p] of Object.entries(palettes)) {
  lines.push(`### ${theme}`, "");
  lines.push("| Pair | Ratio | AA | AAA |", "| --- | ---: | --- | --- |");
  for (const [fg, bg, kind] of requiredPairs(theme)) {
    const ratio = contrast(p[fg], p[bg]);
    const min = kind === "text" ? 4.5 : 3;
    const aa = ratio >= min;
    if (kind !== "info" && !aa) failures++;
    const aaa = kind === "text" ? (ratio >= 7 ? "pass" : "fail") : "N/A";
    const label = `${fg} ${kind === "text" ? "on" : "vs"} ${bg}`;
    const aaLabel =
      kind === "info" ? "n/a (see border)" : aa ? "pass" : "FAIL";
    lines.push(`| ${label} | ${ratio.toFixed(2)} | ${aaLabel} | ${aaa} |`);
  }
  lines.push("");
}

console.log(lines.join("\n"));

if (failures > 0) {
  console.error(`${failures} required pair(s) below threshold.`);
  process.exit(1);
}
