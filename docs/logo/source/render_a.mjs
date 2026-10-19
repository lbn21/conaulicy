// Renders option A's PNGs, the centring overlay and comparison-sheet-a-v2.png
// from the SVGs (Playwright's Chromium, from web/node_modules).
//   node docs/logo/source/render_a.mjs <dir with optimised SVGs> <overlay.svg> <out dir>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../../../web");
const { chromium } = createRequire(path.join(web, "package.json"))("playwright");
const [dir, overlayFile, out] = process.argv.slice(2);

const svgText = (name) => readFileSync(path.join(dir, name), "utf8");
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
const font = (file) =>
  `data:font/woff2;base64,${readFileSync(path.join(web, "assets/fonts", file)).toString("base64")}`;
const FONTS = `@font-face{font-family:A;src:url(${font("atkinson-hyperlegible-next-400.woff2")});font-weight:400}
@font-face{font-family:A;src:url(${font("atkinson-hyperlegible-next-700.woff2")});font-weight:700}
*{font-family:A,sans-serif}`;
// A favicon frozen to one theme (drops or applies its media query).
const frozen = (name, mode) =>
  svgText(name).replace(/@media[^{]*\{([\s\S]*?\})\}/, mode === "light" ? "$1" : "");

const T = {
  dark: { bg: "#10141d", text: "#e9edf2", muted: "#b4bcc8", border: "#6f7a8d" },
  light: { bg: "#f5f7fa", text: "#161b24", muted: "#4a5568", border: "#6f7a8d" },
};

const browser = await chromium.launch();
const page = await browser.newPage();

async function shot(html, width, height, file, scale = 1, transparent = false) {
  await page.setViewportSize({ width, height });
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await p.setContent(`<style>${FONTS}body{margin:0}</style>${html}`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, file), omitBackground: transparent, fullPage: true });
  await p.close();
}

// Icons: 16 from the 16-px design, the rest from the 32-px one.
const fav = uri(frozen("a-favicon.svg", "dark"));
const fav16 = uri(frozen("a-favicon-16.svg", "dark"));
await shot(`<img src="${fav16}" width="16" height="16" style="display:block">`, 16, 16, "a-icon-16.png", 1, true);
await shot(`<img src="${fav}" width="32" height="32" style="display:block">`, 32, 32, "a-icon-32.png", 1, true);
for (const [file, size, scale, radius] of [
  ["a-icon-180.png", 180, 0.74, 0.22],
  ["a-icon-512.png", 512, 0.74, 0.22],
  ["a-icon-maskable-512.png", 512, 0.6, 0],
]) {
  await shot(
    `<div style="width:${size}px;height:${size}px;background:#10141d;border-radius:${size * radius}px;display:grid;place-items:center"><img src="${fav}" style="width:${size * scale}px"></div>`,
    size, size, file, 1, true,
  );
}

// Realistic tier and OG card.
for (const [name, w, h, scale] of [
  ["a-hero-dark", 640, 400, 2],
  ["a-hero-light", 640, 400, 2],
  ["a-pdf-corner", 0, 0, 3],
  ["og-1200x630", 1200, 630, 1],
]) {
  const s = svgText(`${name}.svg`);
  const [, vw, vh] = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const W = w || Math.ceil(vw);
  const H = h || Math.ceil(vh);
  await shot(`<img src="${uri(s)}" width="${W}" height="${H}" style="display:block">`, W, H, `${name}.png`, scale, name === "a-pdf-corner");
}

// Centring overlay (inline, so its labels use Atkinson).
const overlay = readFileSync(overlayFile, "utf8");
const [, ow, oh] = overlay.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
await shot(overlay, Math.ceil(ow), Math.ceil(oh), "a-centring-overlay.png", 1);

// Comparison sheet v2.
const header = (mode) => {
  const t = T[mode];
  return `<div style="width:360px;box-sizing:border-box;background:${t.bg};border-bottom:1px solid ${t.border};padding:8px 16px;display:flex;align-items:center;justify-content:space-between">
  <span style="display:flex;align-items:center;gap:10px;min-height:48px">
    <img src="${uri(svgText(`a-logo-${mode}.svg`))}" style="height:32px">
    <span style="color:${t.muted};font-size:18px">Lubaczów</span></span>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${t.text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></div>`;
};
const favRow = (mode) => {
  const t = T[mode];
  const f32 = uri(frozen("a-favicon.svg", mode));
  const f16 = uri(frozen("a-favicon-16.svg", mode));
  return `<div style="background:${t.bg};color:${t.muted};padding:18px 22px;display:flex;align-items:end;gap:28px;font-size:13px">
  <figure style="margin:0;text-align:center"><img src="${f16}" width="16" height="16"><figcaption>16</figcaption></figure>
  <figure style="margin:0;text-align:center"><img src="${f32}" width="32" height="32"><figcaption>32</figcaption></figure>
  <figure style="margin:0;text-align:center"><img src="${uri(frozen("a-favicon.svg", mode))}" width="180" height="180"><figcaption>180</figcaption></figure>
  <span style="margin-left:8px">${mode}</span></div>`;
};
const h2 = (t) => `<h2 style="font-size:20px;margin:30px 0 12px;color:#161b24">${t}</h2>`;
const sheet = `<div style="background:#fff;padding:28px 32px;width:1236px">
<h1 style="font-size:28px;margin:0 0 4px;color:#161b24">Option A “Tabliczka”, refined (v2)</h1>
<p style="margin:0;color:#4a5568;font-size:15px">Rendered from the SVGs in docs/logo/. Same plate geometry for the flat mark and the enamel hero.</p>
${h2("1 · Flat mark: previous vs new, with the centring overlay")}
<div style="border:1px solid #e3e7ee">${overlay}</div>
${h2("2 · Realistic enamel hero, dark and light")}
<div style="display:flex;gap:16px"><img src="${uri(svgText("a-hero-dark.svg"))}" style="width:610px"><img src="${uri(svgText("a-hero-light.svg"))}" style="width:610px"></div>
${h2("3 · Share card (OG, 1200 × 630, shown at half size)")}
<img src="${uri(svgText("og-1200x630.svg"))}" style="width:600px;border:1px solid #e3e7ee">
${h2("4 · Header at 360 px")}
<div style="display:flex;gap:24px">${header("dark")}${header("light")}</div>
${h2("5 · Favicons at 16 / 32 / 180 px")}
<div style="display:flex;gap:24px">${favRow("dark")}${favRow("light")}</div>
</div>`;
await shot(sheet, 1300, 800, "comparison-sheet-a-v2.png", 1);

await browser.close();
console.log("rendered");
