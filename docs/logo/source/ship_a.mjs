// Builds the shipped logo assets (task 23) in web/ from the optimised SVGs in
// docs/logo/ (Playwright's Chromium, from web/node_modules).
//   node docs/logo/source/ship_a.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.join(here, "..");
const web = path.join(here, "../../../web");
const { chromium } = createRequire(path.join(web, "package.json"))("playwright");

const svgText = (name) => readFileSync(path.join(logo, name), "utf8");
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
// A favicon frozen to the dark colours: PNG and ICO have no media queries.
const dark = (name) => uri(svgText(name).replace(/@media[^{]*\{([\s\S]*?\})\}/, ""));
const NIGHT = "#10141d";

const browser = await chromium.launch();

async function png(html, size, transparent) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  await page.setContent(`<style>body{margin:0}</style>${html}`);
  const buffer = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return buffer;
}

const img = (src, width) => `<img src="${src}" width="${width}" style="display:block">`;
// The 32-px favicon on a night tile; radius 0 = full bleed (Apple rounds the
// corners itself; maskable icons are cut by the launcher, mark in the 80 % circle).
const tile = (size, scale, radius) =>
  png(
    `<div style="width:${size}px;height:${size}px;background:${NIGHT};border-radius:${size * radius}px;display:grid;place-items:center">${img(dark("a-favicon.svg"), size * scale)}</div>`,
    [size, size],
    radius > 0,
  );

// favicon.ico: PNG entries, 16 from the 16-px design, 32 from the 32-px one.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, data], i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(([, data]) => data)]);
}

const app = path.join(web, "app");
const pub = path.join(web, "public");
mkdirSync(pub, { recursive: true });

writeFileSync(
  path.join(app, "favicon.ico"),
  ico([
    [16, await png(img(dark("a-favicon-16.svg"), 16), [16, 16], true)],
    [32, await png(img(dark("a-favicon.svg"), 32), [32, 32], true)],
  ]),
);
copyFileSync(path.join(logo, "a-favicon.svg"), path.join(app, "icon.svg"));
writeFileSync(path.join(app, "apple-icon.png"), await tile(180, 0.74, 0));
writeFileSync(path.join(pub, "icon-192.png"), await tile(192, 0.74, 0.22));
writeFileSync(path.join(pub, "icon-512.png"), await tile(512, 0.74, 0.22));
writeFileSync(path.join(pub, "icon-maskable-512.png"), await tile(512, 0.6, 0));

const og = await png(img(uri(svgText("og-1200x630.svg")), 1200), [1200, 630], false);
writeFileSync(path.join(logo, "og-1200x630.png"), og);
writeFileSync(path.join(pub, "og.png"), og);

await browser.close();
console.log("shipped");
