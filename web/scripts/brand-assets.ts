// Writes everything that takes the palette's colours (lib/palette.ts) and is
// not code: the Sass palette (app/_palette.scss), the bin colours
// (app/waste-colours.css, from lib/waste-colours.ts), the tab icons
// (app/icon.svg, app/favicon.ico), the app icons (public/apple-touch-icon.png,
// at the root with no query, where iOS looks for it; public/icon-*.png) and
// the share card (public/og.png). None is in git.
//   node scripts/brand-assets.ts
// npm runs it before every `npm run dev` and `npm run build` (predev and
// prebuild in package.json; Vercel and CI build with `npm run build`), and
// scripts/check-own-css.mjs before it compiles the Sass.
//
// Work happens only when an input changed. The key is a hash of INPUTS (the
// palette, the logo geometry, the SVG templates, this script) and the
// renderer's version. Same key as the files in place (.brand-assets-key):
// skipped. Otherwise the
// files come from .next/cache/brand-assets/<key>/ (kept between builds by
// Vercel, and by CI's actions/cache on the same inputs), or are drawn and
// cached there. The PNGs are drawn by next/og from lib/brand/*.svg, whose
// plate is currentColor. Was docs/logo/source/ship_a.mjs (task 23), which
// wrote committed copies.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { PLATE, PLATE_COLOUR, RIM, UL, UL_TRANSFORM } from "../lib/logo.ts";
import { paletteScss } from "../lib/palette.ts";
import { wasteColoursCss } from "../lib/waste-colours.ts";

const ROOT = path.join(import.meta.dirname, "..");
export const INPUTS = [
  "lib/palette.ts",
  "lib/logo.ts",
  "lib/govuk-colours.ts",
  "lib/waste-colours.ts",
  "lib/brand/favicon-16.svg",
  "lib/brand/favicon-32.svg",
  "lib/brand/og.svg",
  "scripts/brand-assets.ts",
];
const CACHE = path.join(ROOT, ".next/cache/brand-assets");
// The key of the files in place, beside them (not in .next, which CI moves
// aside for its second build).
const WRITTEN = path.join(ROOT, ".brand-assets-key");

const svgText = (name: string) =>
  readFileSync(path.join(ROOT, "lib/brand", name), "utf8");
const replaceOnce = (text: string, from: string | RegExp, to: string) => {
  if (!(typeof from === "string" ? text.includes(from) : from.test(text)))
    throw new Error(`not found: ${String(from).slice(0, 40)}`);
  return text.replace(from, to);
};
const painted = (svg: string) => svg.replaceAll("currentColor", PLATE_COLOUR);

// The favicons (task 134): the plate fills the square, with a white rim on
// its edge so it stands out on dark tab bars too. Each size has its own
// pixel-fitted "ul.", placed in the SVG: the 32-px one is the logo's, its ink
// box centred (5-26.37 x 8.73-23.24); the 16-px one is drawn on whole pixels.
const faviconSvg = (size: 16 | 32) => painted(svgText(`favicon-${size}.svg`));

// The 32-px "ul." alone, its viewBox its ink box, for the full-bleed tiles.
const UL_INK = "5 8.73 21.37 14.51";
const ulSvg = () =>
  replaceOnce(
    faviconSvg(32).replace(/<path d="[^"]*" class="[pr]"[^>]*\/>/g, ""),
    /width="32" height="32"([^>]*)viewBox="0 0 32 32"/,
    `$1viewBox="${UL_INK}"`,
  );

// The share card's text block, centred optically on the plate (task 88): the
// plate's ink is y 145-485 (centre 315); the text is measured from the first
// line's x-height minus half its ascenders to the last line's baseline plus
// half its descenders, 201-495.3 (centre 348.1, with the name 6.5 % larger
// in task 93), so it moves 33 px up (whole px).
const OG_TEXT_SHIFT = -33;
// Its plate and rim are copies of lib/logo.ts's paths, checked here.
function ogTemplate(): string {
  const svg = svgText("og.svg");
  for (const d of [PLATE, RIM])
    if (!svg.includes(` d="${d}"`))
      throw new Error(
        "lib/brand/og.svg: plate or rim differs from lib/logo.ts",
      );
  return svg;
}
const ogSvg = () =>
  painted(
    replaceOnce(
      replaceOnce(
        ogTemplate(),
        `<path d="${UL}"/>`,
        `<path d="${UL}" transform="${UL_TRANSFORM}"/>`,
      ),
      /(<path fill="#0b0c0c"[\s\S]*)<\/svg>\s*$/,
      `<g transform="translate(0 ${OG_TEXT_SHIFT})">$1</g></svg>`,
    ),
  );

const img = (svg: string, w: number, hgt = w) =>
  h("img", {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    width: w,
    height: hgt,
  });

async function render(element: ReturnType<typeof h>, w: number, hgt: number) {
  const response = new ImageResponse(element, { width: w, height: hgt });
  return Buffer.from(await response.arrayBuffer());
}

/** An SVG as a PNG of its own size, transparent around it. */
const png = (svg: string, w: number, hgt: number) =>
  render(img(svg, w, hgt), w, hgt);

// A full-bleed plum tile with "ul." `scale` of its width, centred (Apple
// rounds the corners itself; maskable icons are cut by the launcher, so "ul."
// stays in the central 80 % circle).
const tile = (size: number, scale: number) => {
  const w = size * scale;
  const [, , inkW, inkH] = UL_INK.split(" ").map(Number);
  return render(
    h(
      "div",
      {
        style: {
          width: size,
          height: size,
          background: PLATE_COLOUR,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      img(ulSvg(), w, (w * inkH) / inkW),
    ),
    size,
    size,
  );
};

// favicon.ico: PNG entries, 16 from the 16-px design, 32 from the 32-px one.
function ico(images: [number, Buffer][]): Buffer {
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

// Each output, by its path in web/, and how it is drawn.
const OUTPUTS: Record<string, () => Promise<Buffer | string>> = {
  "app/_palette.scss": async () => paletteScss(),
  "app/waste-colours.css": async () => wasteColoursCss(),
  "app/icon.svg": async () => faviconSvg(32),
  "app/favicon.ico": async () =>
    ico([
      [16, await png(faviconSvg(16), 16, 16)],
      [32, await png(faviconSvg(32), 32, 32)],
    ]),
  "public/apple-touch-icon.png": () => tile(180, 0.66),
  "public/icon-192.png": () => png(faviconSvg(32), 192, 192),
  "public/icon-512.png": () => png(faviconSvg(32), 512, 512),
  "public/icon-maskable-512.png": () => tile(512, 0.56),
  "public/og.png": () => png(ogSvg(), 1200, 630),
};
export const OUTPUT_PATHS = Object.keys(OUTPUTS);

export function brandAssetsKey(): string {
  const hash = createHash("sha256");
  const next = createRequire(path.join(ROOT, "package.json"))(
    "next/package.json",
  ).version;
  hash.update(`next ${next}\n`);
  for (const input of INPUTS)
    hash.update(`${input}\n`).update(readFileSync(path.join(ROOT, input)));
  return hash.digest("hex").slice(0, 16);
}

export type BrandAssetsResult = "skipped" | "restored" | "regenerated";

export async function writeBrandAssets(): Promise<BrandAssetsResult> {
  const key = brandAssetsKey();
  const inPlace = OUTPUT_PATHS.every((out) => existsSync(path.join(ROOT, out)));
  const written = existsSync(WRITTEN) ? readFileSync(WRITTEN, "utf8") : "";
  let result: BrandAssetsResult = "skipped";
  if (!inPlace || written !== key) {
    const cached = path.join(CACHE, key);
    if (OUTPUT_PATHS.every((out) => existsSync(path.join(cached, out)))) {
      result = "restored";
    } else {
      result = "regenerated";
      for (const [out, draw] of Object.entries(OUTPUTS)) {
        const file = path.join(cached, out);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, await draw());
      }
    }
    for (const out of OUTPUT_PATHS)
      copyFileSync(path.join(cached, out), path.join(ROOT, out));
    // Only the current key is kept.
    for (const old of readdirSync(CACHE))
      if (old !== key) rmSync(path.join(CACHE, old), { recursive: true });
    writeFileSync(WRITTEN, key);
  }
  console.log(`Brand assets ${key}: ${result}`);
  return result;
}

if (import.meta.main) void writeBrandAssets();
