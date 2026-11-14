// Writes everything that takes the palette's colours (lib/palette.ts) and is
// not code: the Sass palette (app/_palette.scss), the bin colours
// (app/waste-colours.css, from lib/waste-colours.ts), the tab icons
// (app/icon.svg, app/favicon.ico), the app icons (public/apple-touch-icon.png,
// at the root with no query, where iOS looks for it; public/icon-*.png) and
// the share card (public/og.png, its text outlined from the TTFs). None is in
// git.
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
// plate is currentColor.
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
import * as fontkit from "fontkit";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { GOVUK_FUNCTIONAL } from "../lib/govuk-colours.ts";
import {
  LOGO_HEIGHT,
  PLATE,
  PLATE_COLOUR,
  PLATE_WIDTH,
  RIM,
  UL,
  UL_TRANSFORM,
} from "../lib/logo.ts";
import { paletteScss } from "../lib/palette.ts";
import { SHARE_CARD, SHARE_CARD_TEXT } from "../lib/share-card.ts";
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
  "lib/share-card.ts",
  "assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf",
  "assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf",
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

// The favicons: the plate fills the square, with a white rim on
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

// The share card (lib/brand/og.svg: the plate, matrix(10 0 0 10 92 145),
// on white) and its text, outlined here from the repo's TTFs (fontkit,
// default features: kerning) from its words (lib/share-card.ts), which also
// fill the template's SHARE_CARD_TEXT placeholders (<title>, aria-label):
// the alt is what the card shows. Every line's ink starts 70 px right of
// the plate (575.2); the name (bold) is sized so its ink ends on the right
// margin (1108, the plate's 92 px mirrored); the tagline is 52 px regular
// in the plate's colour, the area 34 px regular in GOV.UK's secondary text;
// baselines 88 px under the name, 66 px apart, 76 px to the area. A line
// past the margin fails the step: the tagline wraps in lib/share-card.ts,
// never shrinks.
const OG_PLATE = { x: 92, y: 145, scale: 10 };
const OG_RIGHT = 1200 - OG_PLATE.x;
const OG_LEFT = OG_PLATE.x + PLATE_WIDTH * OG_PLATE.scale + 70;
const font = (weight: "Regular" | "Bold") =>
  fontkit.create(
    readFileSync(
      path.join(ROOT, `assets/fonts/AtkinsonHyperlegibleNext-${weight}.ttf`),
    ),
  ) as fontkit.Font;

/** A card line: its words, font, size (none: the name, fitted), its
 * baseline's gap below the one above, and its fill. */
type OgLine = {
  text: string;
  font: fontkit.Font;
  size?: number;
  gap: number;
  fill: string;
};

/** A line's glyphs at 1 unit per em, their ink box and advance. */
function shaped(line: OgLine) {
  const run = line.font.layout(line.text);
  const upm = line.font.unitsPerEm;
  let x = 0;
  const ink = { minX: Infinity, maxX: -Infinity, minY: 0, maxY: 0 };
  const glyphs = run.glyphs.map((glyph, i) => {
    const at = x;
    const box = glyph.path.bbox;
    if (Number.isFinite(box.minX)) {
      ink.minX = Math.min(ink.minX, (at + box.minX) / upm);
      ink.maxX = Math.max(ink.maxX, (at + box.maxX) / upm);
      ink.minY = Math.min(ink.minY, box.minY / upm);
      ink.maxY = Math.max(ink.maxY, box.maxY / upm);
    }
    x += run.positions[i].xAdvance;
    return { glyph, at };
  });
  return { glyphs, ink, upm, xHeight: line.font.xHeight / upm };
}

/** A shaped line as one absolute path, its ink starting at OG_LEFT. */
function outline(line: OgLine, size: number, baseline: number): string {
  const { glyphs, ink, upm } = shaped(line);
  const k = size / upm;
  const origin = OG_LEFT - ink.minX * size;
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const parts: string[] = [];
  for (const { glyph, at } of glyphs)
    for (const { command, args } of glyph.path.commands) {
      const xy = [];
      for (let i = 0; i < args.length; i += 2)
        xy.push(n(origin + (at + args[i]) * k), n(baseline - args[i + 1] * k));
      const op = {
        moveTo: "M",
        lineTo: "L",
        quadraticCurveTo: "Q",
        bezierCurveTo: "C",
        closePath: "Z",
      }[command];
      parts.push(`${op}${xy.join(" ")}`);
    }
  return parts.join("");
}

/**
 * The card's text, centred optically on the plate (its ink, y 145-485,
 * centre 315): the block is measured from the name's x-height minus half
 * its ascenders to the area's baseline plus half its descenders, and moved
 * by whole px. For the current words: 201.2-561.3 before the move (centre
 * 381.3), so 66 px up.
 */
function ogText(): string {
  const [regular, bold] = [font("Regular"), font("Bold")];
  const lines: OgLine[] = [
    {
      text: SHARE_CARD.name,
      font: bold,
      gap: 0,
      fill: GOVUK_FUNCTIONAL.text,
    },
    ...SHARE_CARD.tagline.map((text, i) => ({
      text,
      font: regular,
      size: 52,
      gap: i === 0 ? 88 : 66,
      fill: "currentColor",
    })),
    {
      text: SHARE_CARD.area,
      font: regular,
      size: 34,
      gap: 76,
      fill: GOVUK_FUNCTIONAL["secondary-text"],
    },
  ];
  const name = shaped(lines[0]);
  const nameSize = (OG_RIGHT - OG_LEFT) / (name.ink.maxX - name.ink.minX);
  let baseline = 262;
  const placed = lines.map((line) => {
    baseline += line.gap;
    const size = line.size ?? nameSize;
    const { ink } = shaped(line);
    if (OG_LEFT + (ink.maxX - ink.minX) * size > OG_RIGHT + 0.01)
      throw new Error(`lib/share-card.ts: "${line.text}" passes the margin`);
    return { line, size, baseline, ink };
  });
  const [first, last] = [placed[0], placed[placed.length - 1]];
  const top =
    first.baseline -
    first.size * (name.xHeight + (first.ink.maxY - name.xHeight) / 2);
  const bottom = last.baseline - (last.size * last.ink.minY) / 2;
  const plateMiddle = OG_PLATE.y + (LOGO_HEIGHT * OG_PLATE.scale) / 2;
  const shift = Math.round(plateMiddle - (top + bottom) / 2);
  return placed
    .map(
      ({ line, size, baseline }) =>
        `<path fill="${line.fill}" d="${outline(line, size, baseline + shift)}"/>`,
    )
    .join("");
}

// Its plate and rim are copies of lib/logo.ts's paths, checked here, and
// the plate is where OG_PLATE says.
function ogTemplate(): string {
  const svg = svgText("og.svg");
  for (const d of [PLATE, RIM])
    if (!svg.includes(` d="${d}"`))
      throw new Error(
        "lib/brand/og.svg: plate or rim differs from lib/logo.ts",
      );
  const { x, y, scale } = OG_PLATE;
  if (!svg.includes(`transform="matrix(${scale} 0 0 ${scale} ${x} ${y})"`))
    throw new Error("lib/brand/og.svg: the plate is not at OG_PLATE");
  return svg;
}
const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export const ogSvg = () =>
  painted(
    [
      [`<path d="${UL}"/>`, `<path d="${UL}" transform="${UL_TRANSFORM}"/>`],
      [
        'aria-label="SHARE_CARD_TEXT"',
        `aria-label="${escaped(SHARE_CARD_TEXT)}"`,
      ],
      [
        "<title>SHARE_CARD_TEXT</title>",
        `<title>${escaped(SHARE_CARD_TEXT)}</title>`,
      ],
      [/<\/svg>\s*$/, `${ogText()}</svg>`],
    ].reduce(
      (svg, [from, to]) => replaceOnce(svg, from, to as string),
      ogTemplate(),
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
