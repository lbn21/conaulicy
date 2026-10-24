// Builds the shipped logo assets (task 23) in web/ from the optimised SVGs in
// docs/logo/ (Playwright's Chromium, from web/node_modules).
//   node docs/logo/source/ship_a.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOGO_HEIGHT, UL, UL_SHIFT, UL_TRANSFORM } from "../../../web/lib/logo.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.join(here, "..");
const web = path.join(here, "../../../web");
const { chromium } = createRequire(path.join(web, "package.json"))("playwright");

const svgText = (name) => readFileSync(path.join(logo, name), "utf8");
const replaceOnce = (text, from, to) => {
  if (!(typeof from === "string" ? text.includes(from) : from.test(text))) throw new Error(`not found: ${String(from).slice(0, 40)}`);
  return text.replace(from, to);
};

// "ul." moved UL_SHIFT plate units down from the SVGs' placement (task 88,
// UL_VARIANT in web/lib/logo.ts), as on the site and in the PDF. The favicons
// have their own pixel-fitted "ul.", so they move by whole px only (the plate
// is 26 px tall in the 32-px favicon, 12 in the 16-px one), or not at all.
const ulShift = (svg, plateHeight) => {
  const px = Math.round((UL_SHIFT * plateHeight) / LOGO_HEIGHT);
  return px === 0 ? svg : replaceOnce(svg, '" class="t"', `" class="t" transform="translate(0 ${px})"`);
};
const FAVICON_PLATE = { "a-favicon.svg": 26, "a-favicon-16.svg": 12 };
// The share card's text block, centred optically on the plate (task 88): the
// plate's ink is y 145-485 (centre 315); the text is measured from the first
// line's x-height minus half its ascenders to the last line's baseline plus
// half its descenders, 204.5-495.5 (centre 350), so it moves 35 px up. Its ink
// was 193-499 (centre 346). Font sizes, line spacing and x stay.
const OG_TEXT_SHIFT = -35;
const ogSvg = () =>
  replaceOnce(
    replaceOnce(svgText("og-1200x630.svg"), `<path d="${UL}"/>`, `<path d="${UL}" transform="${UL_TRANSFORM}"/>`),
    /(<path fill="#0b0c0c"[\s\S]*)<\/svg>$/,
    `<g transform="translate(0 ${OG_TEXT_SHIFT})">$1</g></svg>`,
  );
const uri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
// A favicon in the light colours (the site is light only, task 26): the
// #9A5700 plate with white "ul.", without the colour-scheme query.
const light = (name) =>
  ulShift(svgText(name), FAVICON_PLATE[name]).replace(
    /<style>[\s\S]*?<\/style>/,
    "<style>.p{fill:#9A5700}.t{fill:#FFF}</style>",
  );
// The app tiles are white, the page background (BACKGROUND_COLOR in web/lib/theme.ts).
const TILE = "#ffffff";

const browser = await chromium.launch();

async function png(html, size, transparent) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  await page.setContent(`<style>body{margin:0}</style>${html}`);
  const buffer = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return buffer;
}

const img = (src, width) => `<img src="${src}" width="${width}" style="display:block">`;
// The 32-px favicon on a white tile; radius 0 = full bleed (Apple rounds the
// corners itself; maskable icons are cut by the launcher, mark in the 80 % circle).
const tile = (size, scale, radius) =>
  png(
    `<div style="width:${size}px;height:${size}px;background:${TILE};border-radius:${size * radius}px;display:grid;place-items:center">${img(uri(light("a-favicon.svg")), size * scale)}</div>`,
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
    [16, await png(img(uri(light("a-favicon-16.svg")), 16), [16, 16], true)],
    [32, await png(img(uri(light("a-favicon.svg")), 32), [32, 32], true)],
  ]),
);
writeFileSync(path.join(app, "icon.svg"), light("a-favicon.svg"));
writeFileSync(path.join(app, "apple-icon.png"), await tile(180, 0.74, 0));
writeFileSync(path.join(pub, "icon-192.png"), await tile(192, 0.74, 0.22));
writeFileSync(path.join(pub, "icon-512.png"), await tile(512, 0.74, 0.22));
writeFileSync(path.join(pub, "icon-maskable-512.png"), await tile(512, 0.6, 0));

const og = await png(img(uri(ogSvg()), 1200), [1200, 630], false);
writeFileSync(path.join(logo, "og-1200x630.png"), og);
writeFileSync(path.join(pub, "og.png"), og);

await browser.close();
console.log("shipped");
