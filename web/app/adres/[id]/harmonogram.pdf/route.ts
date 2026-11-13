import { readFileSync } from "node:fs";
import path from "node:path";
import { create, type Font } from "fontkit";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/config.generated";
import { readableInk } from "@/lib/contrast";
import { longDate, monthTitle } from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { GOVUK_COLOUR, GOVUK_FUNCTIONAL } from "@/lib/govuk-colours";
import { LOCALE } from "@/lib/locale";
import {
  LOGO_HEIGHT,
  PLATE,
  RIM,
  RIM_WIDTH,
  UL,
  UL_SHIFT,
  WORDMARK,
} from "@/lib/logo";
import { fileSlug } from "@/lib/normalize";
import { pageData } from "@/lib/page-cache";
import { pdfPage } from "@/lib/pages";
import {
  beyondBounds,
  chooseGrid,
  DAY_MARKS,
  dateRows,
  MONTH_DAYS,
  TABLE_ROW,
  tableRows,
} from "@/lib/pdf-grid";
import { drawIcon, FRACTION_ICONS, PDF_ICONS } from "@/lib/pdf-icon";
import {
  KEY_TOKENS,
  keyCell,
  keyGrid,
  keyTokens,
  windowMonths,
} from "@/lib/pdf-key";
import { scheduleName } from "@/lib/places";
import {
  type Pickup,
  type PickupDay,
  type PlaceView,
  placeParams,
} from "@/lib/schedule";
import { hasUpcoming, putOutNote, unverifiedNote } from "@/lib/schedule-notes";
import { SITE_NAME } from "@/lib/share";
import { GUIDES, type GuideItem, guideFor } from "@/lib/sorting-guide";
import { THEME_COLOR } from "@/lib/theme";
import {
  FRACTIONS,
  TOKEN,
  tokenLabel,
  tokenSubtype,
  tones,
} from "@/lib/waste-bin";
import { WASTE_COLOURS as WASTE } from "@/lib/waste-colours";
import { wastePath } from "@/lib/waste-module";

// Printed QR codes and links point at the waste subpage
// (/adres/<id>/smieci) on the permanent address
// (SITE_URL), never at a preview deployment.

// Bundled through outputFileTracingIncludes in next.config.ts.
const FONT_DIR = path.join(process.cwd(), "assets/fonts");
const REGULAR = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Regular.ttf"),
);
const BOLD = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Bold.ttf"),
);

// A4 portrait in points, laid out as a council's bin leaflet in the site's
// look, on one spacing scale (U, 4 pt) and one type scale (TYPE). Two
// pages, every address, one geometry whatever the data: page 1 is the next
// six months (a compact cherry band with the "ul." plate and the QR code,
// identical bordered month tables in a fixed 3 × 2 grid (lib/pdf-grid.ts),
// the key, one footer line); page 2, „Co wrzucać”, the same for every
// address: equal tiles for the bins and a row for the waste handed in
// separately, from the gmina's own rules (lib/sorting-guide.ts) with
// Lucide's icons, the PSZOK line beside the QR code to the full rules, one
// footer line. Page 1 is tagged (headings, tables, the key's list) for
// screen readers; the site has every date as text.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
// The spacing scale: every gap, padding and size a multiple of U.
const U = 4;
const MARGIN = 7 * U;
/** Between the guide's tiles. */
const GUTTER = 2 * U;
/**
 * Page 1's month grid: always 3 × 2 tables, the six months of the window
 * (Jakub, t334), as wide as the page allows with a gutter that reads as
 * one between tables.
 */
const MONTH_COLUMNS = 3;
const MONTH_ROWS = 2;
const MONTH_GUTTER = 3 * U;
/** Between the page's blocks: band, note, grid, key, footer. */
const SECTION = 4 * U;
/** A table cell's inner padding: the headers breathe, as the leaflet's. */
const TABLE_PAD = 2 * U;
/** Every border and rule: one weight, one colour (RULE, below). */
const LINE_W = 0.5;
const CONTENT_W = PAGE_W - 2 * MARGIN;

/** The site's type scale at its physical size: CSS px × 0.75 = pt. */
const px = (n: number) => n * 0.75;

/** The type scale: GOV.UK's sizes in pt, and one under them for fine print. */
const TYPE = {
  fine: 9,
  // The month tables' text, headers and days alike, if 16px does not fit.
  table: px(15),
  small: px(16),
  body: px(19),
  heading: px(24),
  title: px(36),
} as const;

// Atkinson Hyperlegible Next's vertical metrics, in em. PDFKit sets a line
// from the top of its ascender (0.984), so the baseline is ASCENT below y and
// the cap height (0.668) starts ASCENT - CAP below it. Spacing is measured
// to the ink: inkOf() gives a text's own glyphs.
const ASCENT = 0.984;
const LINE = ASCENT + 0.316;
const CAP = 0.668;

/** Each size's row on the scale, and the gap PDFKit adds for that pitch. */
const ROW: Record<number, number> = {
  [TYPE.fine]: 3 * U,
  [TYPE.table]: 4 * U,
  [TYPE.small]: 4 * U,
  [TYPE.body]: 5 * U,
  [TYPE.heading]: 6 * U,
  [TYPE.title]: 9 * U,
};
const lineGap = (size: number) => ROW[size] - size * LINE;

// GOV.UK Frontend's palette, as on the site (lib/govuk-colours.ts).
const BLACK = GOVUK_FUNCTIONAL.text;
const WHITE = GOVUK_COLOUR.white;
const SECONDARY_TEXT = GOVUK_FUNCTIONAL["secondary-text"];
const PANEL = GOVUK_COLOUR["black-tint-95"];
const RULE = SECONDARY_TEXT;
// govuk-colour("red"), also GOV.UK's error colour.
const RED = GOVUK_COLOUR.red;
// The bands take the site header's colour (lib/theme.ts).
const HEADER = THEME_COLOR;

// ---------------------------------------------------------------- marks

// One shape per fraction, so the calendar reads in black-and-white print and
// for colour-blind readers; the colour is the real bin colour (lib/waste-colours.ts)
// on top. Rare fractions are a letter in an outlined square. The website
// keeps its bin icons.
type Mark = {
  shape: "circle" | "ring" | "square" | "triangle" | "diamond" | "star";
  fill: string;
  stroke?: string;
};
const MARKS: Record<string, Mark | string> = {
  zmieszane: { shape: "circle", fill: WASTE.zmieszane },
  popiol: { shape: "ring", fill: WASTE.popiol },
  bio: { shape: "square", fill: WASTE.bio },
  papier: { shape: "triangle", fill: WASTE.papier },
  // Outlined darker than the site's -border: small marks on paper need it.
  "plastik-metale": {
    shape: "diamond",
    fill: WASTE["plastik-metale"],
    stroke: WASTE["plastik-metale-print"],
  },
  szklo: { shape: "star", fill: WASTE.szklo },
  gabaryty: "G",
  elektro: "E",
  opony: "O",
  tekstylia: "T",
};

/**
 * Each shape's box in its square slot, so all look one size (Jakub, t333):
 * the round ones and the square slightly smaller (a square looks the
 * biggest), the pointed ones the whole slot. One slot (MARK, below) sizes
 * them all; a slot of 11 keeps the circle at 10 pt.
 */
const OPTICAL = {
  circle: 10 / 11,
  ring: 10 / 11,
  square: 8.5 / 11,
  triangle: 1,
  diamond: 1,
  star: 1,
} as const;

/** Each fraction's name, the site's: the key's and the guide's, every address. */
const TONE_LABEL: Record<string, string> = Object.fromEntries(
  FRACTIONS.map(({ subtype, label }) => [subtype, label]),
);

function drawMark(
  doc: PDFKit.PDFDocument,
  tone: string,
  cx: number,
  cy: number,
  s: number,
) {
  const mark = MARKS[TOKEN[tone]] ?? "?";
  // A letter's square, like the square mark; a shape, its optical box.
  const box =
    s * (typeof mark === "string" ? OPTICAL.square : OPTICAL[mark.shape]);
  const r = box / 2;
  doc.save().lineJoin("round");
  if (typeof mark === "string") {
    doc
      .rect(cx - r, cy - r, box, box)
      .lineWidth(box * 0.09)
      .strokeColor(BLACK)
      .stroke();
    // Centred by its ink, as the dates are: equal space on every side.
    const size = box * 0.8;
    const ink = inkOf("bold", size, mark);
    const top = cy + (ink.above - ink.below) / 2 - size * ASCENT;
    doc
      .font("bold")
      .fontSize(size)
      .fillColor(BLACK)
      .text(mark, cx - (ink.left + ink.right) / 2, top, { lineBreak: false });
    doc.restore();
    return;
  }
  const fill = () => {
    if (mark.stroke)
      doc.lineWidth(box * 0.09).fillAndStroke(mark.fill, mark.stroke);
    else doc.fillColor(mark.fill).fill();
  };
  // Every shape's box centred on (cx, cy): the row's midline, the day
  // number's cap-centre.
  switch (mark.shape) {
    case "circle":
      doc.circle(cx, cy, r);
      fill();
      break;
    case "ring":
      doc
        .circle(cx, cy, r - box * 0.13)
        .lineWidth(box * 0.26)
        .strokeColor(mark.fill)
        .stroke();
      break;
    case "square":
      doc.rect(cx - r, cy - r, box, box);
      fill();
      break;
    case "triangle": {
      // Equilateral, as wide as the box; its box centred.
      const h = (box * Math.sqrt(3)) / 2;
      doc.polygon([cx, cy - h / 2], [cx + r, cy + h / 2], [cx - r, cy + h / 2]);
      fill();
      break;
    }
    case "diamond":
      doc.polygon(
        [cx, cy - r],
        [cx + r * 0.85, cy],
        [cx, cy + r],
        [cx - r * 0.85, cy],
      );
      fill();
      break;
    case "star": {
      // Five points on the box's circle; the lower points reach
      // cos 36° of the radius, so the star is lowered by half the
      // difference to centre its box.
      const points: Array<[number, number]> = [];
      const drop = (r * (1 - Math.cos(Math.PI / 5))) / 2;
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push([cx + rr * Math.cos(a), cy + drop + rr * Math.sin(a)]);
      }
      doc.polygon(...points);
      fill();
      break;
    }
  }
  doc.restore();
}

// ---------------------------------------------------------------- helpers

function artifact(doc: PDFKit.PDFDocument, draw: () => void) {
  doc.markContent("Artifact", { type: "Layout" });
  draw();
  doc.endMarkedContent();
}

function drawQr(
  doc: PDFKit.PDFDocument,
  url: string,
  x: number,
  y: number,
  size: number,
) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const cell = size / modules.size;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) {
        doc.rect(x + col * cell, y + row * cell, cell + 0.05, cell + 0.05);
      }
    }
  }
  doc.fillColor(BLACK).fill();
}

/**
 * The plate and wordmark on the band, as in the site header: a white plate,
 * the "ul." and rim cut out to the band's brown, and the wordmark centred
 * optically on the plate, as in the logo files.
 */
function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, h: number) {
  doc
    .save()
    .translate(x, y)
    .scale(h / LOGO_HEIGHT);
  doc.path(PLATE).fillColor(WHITE).fill();
  doc.save().translate(0, UL_SHIFT).path(UL).fillColor(HEADER).fill();
  doc.restore();
  doc.path(RIM).lineWidth(RIM_WIDTH).strokeColor(HEADER).stroke();
  doc.path(WORDMARK).fillColor(WHITE).fill();
  doc.restore();
}

/** A TTF file's one font, read with fontkit (PDFKit's own font reader). */
function fontOf(file: Buffer): Font {
  const font = create(file);
  if ("fonts" in font) throw new Error("A font collection, not one font");
  return font;
}

// Faces of their own, only for measuring, laid out as PDFKit lays out the
// text (fontkit, default features): reading glyphs through the PDF's own
// fonts would disturb their text layer (pdftotext lost characters).
const FACES: Record<string, Font> = {
  regular: fontOf(REGULAR),
  bold: fontOf(BOLD),
};

/**
 * How far a text's ink reaches above and below its baseline, in pt, from its
 * glyphs' boxes, and from its start to its first and last ink. For a wrapped
 * paragraph above and below cover every line.
 */
function inkOf(
  font: string,
  size: number,
  text: string,
): { above: number; below: number; left: number; right: number } {
  const face = FACES[font];
  const run = face.layout(text);
  const boxes = run.glyphs.map((glyph) => glyph.bbox);
  const scale = size / face.unitsPerEm;
  let x = 0;
  const xs = run.glyphs.map((glyph, i) => {
    const at = [x + glyph.bbox.minX, x + glyph.bbox.maxX];
    x += run.positions[i].xAdvance;
    return at;
  });
  return {
    above: Math.max(0, ...boxes.map((box) => box.maxY)) * scale,
    below: -Math.min(0, ...boxes.map((box) => box.minY)) * scale,
    left: Math.min(...xs.map(([l]) => l)) * scale,
    right: Math.max(...xs.map(([, r]) => r)) * scale,
  };
}

function weekdayName(iso: string): string {
  return absoluteDay(iso).split(",")[0];
}

/**
 * The weekday of at least three in four pickups, or null when there is no
 * single usual day (then the band names none).
 */
function usualWeekday(days: PickupDay[]): string | null {
  const counts = new Map<string, number>();
  for (const day of days) {
    const name = weekdayName(day.date);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const [top] = [...counts].sort((a, b) => b[1] - a[1]);
  return top && top[1] / days.length >= 0.75 ? top[0] : null;
}

function label(pickups: Pickup[]): string {
  return pickups.map((p) => p.label).join(", ");
}

function tonesOf(day: PickupDay): string[] {
  return day.pickups.flatMap((p) => tones(p.subtype));
}

function moved(day: PickupDay): string | null {
  return day.pickups.find((p) => p.shiftedFrom)?.shiftedFrom ?? null;
}

function spoken(day: PickupDay): string {
  const from = moved(day);
  const when = absoluteDay(day.date);
  return from ? `${when} (zamiast: ${absoluteDay(from)})` : when;
}

// ---------------------------------------------------------------- render

function render(place: PlaceView, url: string): Promise<Buffer> {
  const months = windowMonths(place.today);
  const inWindow = place.days.filter((day) =>
    months.includes(day.date.slice(0, 7)),
  );
  const byMonth = new Map<string, PickupDay[]>();
  for (const day of inWindow) {
    const key = day.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), day]);
  }
  // Data beyond the fixed bounds (lib/pdf-grid.ts) is stopped by the
  // import's guard; should any reach here, the PDF refuses it (a 500)
  // rather than clip a date or draw rows past its fixed geometry.
  const beyond = beyondBounds(
    new Map(inWindow.map((day) => [day.date, tonesOf(day).length])),
  );
  if (beyond.months.length > 0 || beyond.days.length > 0) {
    throw new Error(
      `harmonogram.pdf: beyond the PDF's bounds (${MONTH_DAYS} dates a month, ${DAY_MARKS} marks a date): ${[...beyond.months, ...beyond.days].map(([k, n]) => `${k}: ${n}`).join(", ")}`,
    );
  }
  // Only months with dates are printed, up to the last published one.
  const printed = months.filter((key) => byMonth.has(key));
  const usual = usualWeekday(inWindow);
  const putOutBy = inWindow
    .flatMap((day) => day.pickups)
    .find((p) => p.putOutBy)?.putOutBy;
  const putOut = putOutBy ? putOutNote(putOutBy) : null;
  const title = place.name;
  const dayLine = usual ? `Twój dzień odbioru: ${usual}` : null;
  // Page 2: what goes in each of the place's bins, from its gmina's own
  // rules (lib/sorting-guide.ts); none without them.
  const guide = guideFor(place.gmina);

  const doc = new PDFDocument({
    size: "A4",
    // The layout keeps its own margins; a small bottom margin stops PDFKit
    // from adding a page when the footer ends right at the edge.
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 4 },
    pdfVersion: "1.7",
    // Tagged, but no PDF/UA claim (subset) until it passes veraPDF.
    tagged: true,
    lang: LOCALE,
    displayTitle: true,
    font: REGULAR as unknown as string,
    info: {
      Title: `Harmonogram odbioru odpadów – ${place.label}`,
      Author: SITE_NAME,
      Subject: place.gmina,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  doc.registerFont("regular", REGULAR);
  doc.registerFont("bold", BOLD);

  const root = doc.struct("Document");
  doc.addStructure(root);
  // Content repeated on later pages is tagged once and drawn as an artifact
  // elsewhere.
  const tag = (
    parent: PDFKit.PDFStructureElement,
    type: string,
    draw: () => void,
    options: { actual?: string } = {},
  ) => {
    parent.add(doc.struct(type, options, draw));
  };
  /** A line of text whose cap height is centred in a row box: its top. */
  const capTop = (size: number, top: number, height: number) =>
    top + height / 2 + (size * CAP) / 2 - size * ASCENT;
  /** Text in one row box, cap-centred, never wrapped. */
  const rowText = (
    font: string,
    size: number,
    colour: string,
    text: string,
    x: number,
    top: number,
    height: number,
    options: PDFKit.Mixins.TextOptions = {},
  ) => {
    doc
      .font(font)
      .fontSize(size)
      .fillColor(colour)
      .text(text, x, capTop(size, top, height), {
        lineBreak: false,
        ...options,
      });
  };
  /** Wrapped text, every line on the row pitch of its size. */
  const block = (font: string, size: number, text: string, width: number) => {
    doc.font(font).fontSize(size);
    const lines = Math.round(
      doc.heightOfString(text, { width, lineGap: lineGap(size) }) / ROW[size],
    );
    return Math.max(1, lines) * ROW[size];
  };
  const blockText = (
    font: string,
    size: number,
    colour: string,
    text: string,
    x: number,
    top: number,
    width: number,
  ) => {
    doc
      .font(font)
      .fontSize(size)
      .fillColor(colour)
      .text(text, x, capTop(size, top, ROW[size]), {
        width,
        lineGap: lineGap(size),
      });
  };
  /** A rule across the content width. */
  const rule = (y: number) => {
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .lineWidth(LINE_W)
      .strokeColor(RULE)
      .stroke();
  };
  const ink = (fill: string) => readableInk(fill, [BLACK, WHITE]);
  /** The largest size of the scale, from `sizes`, at which text fits a line. */
  const fitting = (
    font: string,
    text: string,
    width: number,
    sizes: number[],
  ) =>
    sizes.find((size) => {
      doc.font(font).fontSize(size);
      return doc.widthOfString(text) <= width;
    }) ?? sizes[sizes.length - 1];
  /**
   * The largest size of `sizes` at which text fits one line; past the
   * smallest, that size scaled down until it does (in quarter points), so a
   * name of any length stays on one line and never moves what is below it.
   */
  const oneLine = (
    font: string,
    text: string,
    width: number,
    sizes: number[],
  ) => {
    const size = fitting(font, text, width, sizes);
    doc.font(font).fontSize(size);
    const w = doc.widthOfString(text);
    return w <= width ? size : Math.floor((size * width * 4) / w) / 4;
  };

  // ------------------------------------------------------------ footer
  // At the foot of each page, under a rule: a block of fine print in rows
  // reserved for the longest it can be, so it never moves what is above it
  // (Tech Lead, t351). Page 1: the schedule's source and the day it was
  // checked, then the unverified note where the place has one (else the row
  // stays empty). Page 2: every source of the gmina's guide, each linked,
  // and the day they were checked.
  const FOOT = TYPE.fine;
  type Run = { text: string; link?: string };
  type Paragraph = { runs: Run[]; colour: string };
  const plain = (p: Paragraph) => p.runs.map((r) => r.text).join("");
  const rowsOf = (p: Paragraph) =>
    block("regular", FOOT, plain(p), CONTENT_W) / ROW[FOOT];
  const oldest = (days: Array<string | null>) =>
    days.filter((d): d is string => d !== null).sort()[0] ?? null;
  const footerBlock = (rows: number) => {
    const top = PAGE_H - MARGIN - rows * ROW[FOOT];
    const ruleY = top - 2 * U;
    const draw = (
      parent: PDFKit.PDFStructureElement,
      paragraphs: Paragraph[],
    ) => {
      artifact(doc, () => rule(ruleY));
      let y = top;
      for (const p of paragraphs) {
        const at = y;
        tag(parent, "P", () => {
          doc.font("regular").fontSize(FOOT).fillColor(p.colour);
          p.runs.forEach((run, i) => {
            const options = {
              width: CONTENT_W,
              lineGap: lineGap(FOOT),
              continued: i < p.runs.length - 1,
              link: run.link ?? null,
            };
            if (i === 0) {
              doc.text(run.text, MARGIN, capTop(FOOT, at, ROW[FOOT]), options);
            } else doc.text(run.text, options);
          });
        });
        y += rowsOf(p) * ROW[FOOT];
      }
    };
    return { top: ruleY, draw };
  };
  const scheduleFooter: Paragraph = {
    runs: [
      {
        text: [
          `Źródło: ${scheduleName(place.gmina)}`,
          "Nie jesteśmy urzędem.",
        ].join(" · "),
      },
    ],
    colour: SECONDARY_TEXT,
  };
  const unverified: Paragraph | null = place.verified
    ? null
    : { runs: [{ text: unverifiedNote(place.gmina) }], colour: BLACK };
  /** A guide's publisher and sources, each named and linked (its site),
   * then the day. */
  const sourcesFooter = (g: NonNullable<ReturnType<typeof guideFor>>) => {
    const name = (label: string) =>
      label.match(/„([^”]+)”/)?.[1] ?? label.split(",")[0];
    const site = (url: string) => new URL(url).hostname.replace(/^www\./, "");
    const runs: Run[] = [{ text: `Źródła zasad (${g.publisher}): ` }];
    // Each source ends with its comma and the next starts with the space,
    // so a line never starts with the comma.
    g.sources.forEach((source, i) => {
      const last = i === g.sources.length - 1;
      runs.push({
        text: `${i > 0 ? " " : ""}${name(source.label)} (${site(source.url)})${last ? "" : ","}`,
        link: source.url,
      });
    });
    const checked = oldest(g.sources.map((s) => s.checkedAt));
    runs.push({
      text: ` · ${checked ? `stan na ${longDate(checked)} · ` : ""}Nie jesteśmy urzędem.`,
    });
    return { runs, colour: SECONDARY_TEXT } satisfies Paragraph;
  };

  // ------------------------------------------------------------ bands
  const widthOf = (font: string, size: number, text: string) => {
    doc.font(font).fontSize(size);
    return doc.widthOfString(text);
  };
  // The band, one on both pages (Jakub, t359), stacked as the first
  // redesign's (PR 263, 59034e6; Jakub, t360): the plate, then where, then the
  // street's name, then its day line, one under another at the left margin,
  // each on its row of the scale as there (the plate, three steps, the
  // body's row, the title's row, a step, the body's row); on the right the
  // QR code's white box, a step, then its caption on one line, right-aligned
  // under the box: one unit, the box's right edge and the caption ink's
  // right edge both on the right margin, as the left block is flush with
  // the left (Jakub, t362, t363). The left block is
  // centred by its ink on the band's midline (the plate's top to the day
  // line's baseline), the right unit by all of its ink (the box's top to
  // the caption's descenders): equal padding above and below each. The rows are
  // reserved at the scale's sizes, so a name set smaller to fit, or no day
  // line, leaves the geometry one for every address. Its height (37 U) is
  // the most page 2 leaves under the same gap as page 1's (GRID_GAP): the
  // guide's tiles, at its least type size, fit the rest of the page with
  // the longest content of any gmina's guide (t360).
  const LOGO_H = 6 * U;
  const qrSize = 20 * U;
  const qrBox = qrSize + 2 * U;
  const scan = "Zeskanuj: aktualne terminy";
  const scanInk = inkOf("regular", TYPE.small, scan);
  // Both flush right: the box's right edge and the caption ink's.
  const qrX = PAGE_W - MARGIN - qrBox;
  const scanX = PAGE_W - MARGIN - scanInk.right;
  /** A row's cap baseline below the row's top: its cap centred in it. */
  const baseline = (size: number) => ROW[size] / 2 + (size * CAP) / 2;
  // The left block's rows, from its top.
  const kickerRow = LOGO_H + 3 * U;
  const titleRow = kickerRow + ROW[TYPE.body];
  const lineRow = titleRow + ROW[TYPE.title] + U;
  const leftInk = lineRow + baseline(TYPE.body);
  // The right block's caption row, from its top.
  const scanRow = qrBox + U;
  const rightInk = scanRow + baseline(TYPE.small) + scanInk.below;
  const bandH = 37 * U;
  const leftTop = (bandH - leftInk) / 2;
  const rightTop = (bandH - rightInk) / 2;
  // Where and the name end a gap and a half before the QR's box, beside
  // them; the day line before the caption, beside it.
  const bandTextW = qrX - 6 * U - MARGIN;
  const bandLineW = Math.min(qrX, scanX + scanInk.left) - 6 * U - MARGIN;
  const kicker = `${place.area} · Harmonogram odbioru odpadów`;
  const kickerSize = oneLine("regular", kicker, bandTextW, [TYPE.body]);
  // The street's name and its day line each on one line, so the longest
  // name leaves the calendar where it is.
  const titleSize = oneLine("bold", title, bandTextW, [
    TYPE.title,
    TYPE.heading,
    TYPE.body,
    TYPE.small,
  ]);
  const bandLine = [dayLine, putOut].filter(Boolean).join(" · ");
  const bandLineSize = oneLine("bold", bandLine, bandLineW, [
    TYPE.body,
    TYPE.small,
  ]);

  const drawBand = (parent: PDFKit.PDFStructureElement) => {
    artifact(doc, () => {
      doc.rect(0, 0, PAGE_W, bandH).fillColor(HEADER).fill();
      drawLogo(doc, MARGIN, leftTop, LOGO_H);
      doc.rect(qrX, rightTop, qrBox, qrBox).fillColor(WHITE).fill();
      drawQr(doc, url, qrX + U, rightTop + U, qrSize);
    });
    tag(parent, "P", () =>
      rowText(
        "regular",
        kickerSize,
        WHITE,
        kicker,
        MARGIN,
        leftTop + kickerRow,
        ROW[TYPE.body],
      ),
    );
    tag(parent, "H1", () =>
      rowText(
        "bold",
        titleSize,
        WHITE,
        title,
        MARGIN,
        leftTop + titleRow,
        ROW[TYPE.title],
      ),
    );
    if (bandLine) {
      tag(parent, "P", () =>
        rowText(
          "bold",
          bandLineSize,
          WHITE,
          bandLine,
          MARGIN,
          leftTop + lineRow,
          ROW[TYPE.body],
        ),
      );
    }
    tag(parent, "P", () =>
      rowText(
        "regular",
        TYPE.small,
        WHITE,
        scan,
        scanX,
        rightTop + scanRow,
        ROW[TYPE.small],
        { link: url },
      ),
    );
    return bandH;
  };

  // ------------------------------------------------------------ key
  // Above the footer, the same for every address (lib/pdf-key.ts): the
  // key's heading on a line of its own, then one grid of equal cells across
  // the content width (rows of 5 U, marks the tables' size), sized from the
  // data alone: as many columns as the widest name of any zone's key
  // allows, as many rows as the fullest key of any zone in any six months
  // needs. An address fills its cells in the key's order, with the site's
  // names, and leaves the rest empty. One entry per bin colour token
  // (KEY_TOKENS): fractions sharing a token share its mark and its entry,
  // named by the token (tokenLabel). On the heading's line, right-aligned
  // in a fixed slot, a moved date's note, drawn only where the page has one.
  // One slot for every mark, in the tables and the key (OPTICAL); a full
  // step between slots.
  const MARK = 11;
  const MARK_GAP = U;
  const KEY_ROW = 5 * U;
  const KEY_GAP = 3 * U;
  const keyHeading = "Oznaczenia";
  const movedLabel = "Termin przesunięty";
  const keyName = tokenLabel;
  /** These months' tokens, in the key's order, and any moved date. */
  const keyFor = (keys: string[]) => {
    const days = keys.flatMap((key) => byMonth.get(key) ?? []);
    return {
      tokens: keyTokens(
        days.flatMap((day) => day.pickups).map((p) => p.subtype),
      ),
      moved: days.some((day) => moved(day)),
    };
  };
  // Every token the site knows (lib/pdf-key.ts KEY_TOKENS), never the
  // data's: one grid on every PDF, whatever is loaded.
  doc.font("regular").fontSize(TYPE.small);
  const keyLayout = keyGrid(
    CONTENT_W,
    KEY_GAP,
    Math.max(
      ...KEY_TOKENS.map((t) => MARK + U + doc.widthOfString(keyName(t))),
    ),
    KEY_TOKENS.length,
  );
  /** The heading's row (and the moved date's note), then the grid's. */
  const KEY_H = (1 + keyLayout.rows) * KEY_ROW;
  const drawKey = (
    parent: PDFKit.PDFStructureElement,
    key: ReturnType<typeof keyFor>,
    top: number,
  ) => {
    tag(parent, "H2", () =>
      rowText("bold", TYPE.small, BLACK, keyHeading, MARGIN, top, KEY_ROW),
    );
    const list = doc.struct("L");
    parent.add(list);
    key.tokens.forEach((token, i) => {
      const cell = keyCell(keyLayout, i);
      const x = MARGIN + cell.x;
      const rowTop = top + (1 + cell.row) * KEY_ROW;
      const mark = () =>
        drawMark(
          doc,
          tokenSubtype(token),
          x + MARK / 2,
          rowTop + KEY_ROW / 2,
          MARK,
        );
      artifact(doc, mark);
      tag(list, "LI", () =>
        rowText(
          "regular",
          TYPE.small,
          BLACK,
          keyName(token),
          x + MARK + U,
          rowTop,
          KEY_ROW,
        ),
      );
    });
    list.end();
  };
  /** A moved date's note: its cell's red, then what it means. */
  doc.font("regular").fontSize(TYPE.small);
  const movedX = PAGE_W - MARGIN - (MARK + U + doc.widthOfString(movedLabel));
  const drawMoved = (parent: PDFKit.PDFStructureElement, top: number) => {
    const cy = top + KEY_ROW / 2;
    const swatch = () =>
      doc
        .rect(movedX, cy - MARK / 2 - U / 2, MARK, MARK + U)
        .fillColor(RED)
        .fill();
    artifact(doc, swatch);
    tag(parent, "P", () =>
      rowText(
        "regular",
        TYPE.small,
        BLACK,
        movedLabel,
        movedX + MARK + U,
        top,
        KEY_ROW,
      ),
    );
  };

  // ------------------------------------------------------------ grid
  // Identical month tables, as the leaflet's: a title row, a „Dzień |
  // Odpady” header row on grey, and the same number of body rows in every
  // month (lib/pdf-grid.ts: 3 × 2, the six months of the window; it fits
  // the marks and the row height); every cell
  // bordered, each border drawn once.
  // The day number only, as the leaflet's.
  const dateText = (day: PickupDay) => String(Number(day.date.slice(8)));
  /** Up to the next step of the scale. */
  const onScale = (n: number) => Math.ceil(n / U) * U;
  // Between the band and the grid, and between grid rows: one gap; the
  // key below the grid takes the rest, its heading row's own air above its
  // ink making the same gap (t358).
  const GRID_GAP = 8 * U;
  const ROW_GAP = GRID_GAP;
  // Page 1's footer: the source line and the unverified note's row, on
  // every PDF (the note in one row at the fine size, either gmina's).
  const footer1 = footerBlock(2);
  // Sized once, for every address, from fixed bounds (lib/pdf-grid.ts):
  // MONTH_DAYS dates in every month, DAY_MARKS marks on a date, rows of
  // TABLE_ROW at the body size, under the band and above the key's fixed
  // grid. Fewer months or dates leave the space empty.
  // The key, at one place on every PDF: a step above the footer's rule
  // (its last row's own air above it).
  const keyTop = footer1.top - 2 * U - KEY_H;
  const gridTop = bandH + GRID_GAP;
  const gridMonths = months.map((key) => ({ key, marks: [] }));
  // As the leaflet's: nothing bold, headers the days' size, set apart only
  // by the grey; every table text TABLE_PAD in from its borders. The date
  // column holds „Dzień” over one or two digits, as narrow as „Dzień” with
  // U each side when the marks need the room; „Dzień” is still set
  // TABLE_PAD in (lib/pdf-grid.ts fitMarks).
  const cellSize = TYPE.body;
  const textW = Math.max(
    widthOf("regular", cellSize, "Dzień"),
    widthOf("regular", cellSize, "28"),
  );
  const grid = chooseGrid({
    months: gridMonths,
    profiles: [Array<number>(MONTH_DAYS).fill(DAY_MARKS)],
    least: DAY_MARKS,
    width: CONTENT_W,
    gap: MONTH_GUTTER,
    height: keyTop - SECTION - gridTop,
    rowGap: ROW_GAP,
    dateW: onScale(textW + 2 * TABLE_PAD),
    minDateW: Math.ceil(textW + 2 * U),
    minMarksW: onScale(widthOf("regular", cellSize, "Odpady") + 2 * TABLE_PAD),
    pad: TABLE_PAD,
    mark: MARK + 2,
    markGap: MARK_GAP,
    // Only the date column gives way: the marks keep their size and a full
    // step between them.
    minMarkGap: MARK_GAP,
    minMark: MARK + 2,
    columns: MONTH_COLUMNS,
    gridRows: MONTH_ROWS,
    maxRow: TABLE_ROW,
    minRow: TABLE_ROW,
    rowStep: 0.5,
  });
  if (!grid.fits) {
    console.warn("harmonogram.pdf: the month grid does not fit page 1");
  }
  const { rowH, dateW, mark: cellMark, markGap: cellGap } = grid;
  const tableH = (grid.bodyRows + 2) * rowH;

  const drawMonth = (key: string, x: number, y: number) => {
    const days = byMonth.get(key) ?? [];
    const w = grid.tableW;
    const head = y + rowH;
    const body = head + rowH;
    // Fills first, then every line once.
    artifact(doc, () => {
      doc
        .rect(x, y, w, 2 * rowH)
        .fillColor(PANEL)
        .fill();
      let top = body;
      for (const day of days) {
        const h = dateRows(tonesOf(day).length, grid.perLine) * rowH;
        if (moved(day)) doc.rect(x, top, dateW, h).fillColor(RED).fill();
        top += h;
      }
    });
    tag(root, "H2", () =>
      rowText(
        "regular",
        cellSize,
        BLACK,
        monthTitle(`${key}-01`),
        x + TABLE_PAD,
        y,
        rowH,
      ),
    );
    const table = doc.struct("Table");
    root.add(table);
    const headRow = doc.struct("TR");
    table.add(headRow);
    headRow.add(
      doc.struct("TH", {}, () =>
        rowText("regular", cellSize, BLACK, "Dzień", x + TABLE_PAD, head, rowH),
      ),
    );
    headRow.add(
      doc.struct("TH", {}, () =>
        rowText(
          "regular",
          cellSize,
          BLACK,
          "Odpady",
          x + dateW + TABLE_PAD,
          head,
          rowH,
        ),
      ),
    );
    // Body rows: a line under each, except inside a date that takes two.
    const breaks: number[] = [];
    let top = body;
    for (const day of days) {
      const lines = dateRows(tonesOf(day).length, grid.perLine);
      const from = moved(day);
      const rowTop = top;
      const tr = doc.struct("TR");
      table.add(tr);
      tr.add(
        doc.struct("TD", { actual: spoken(day) }, () =>
          rowText(
            "regular",
            cellSize,
            from ? ink(RED) : BLACK,
            dateText(day),
            x,
            rowTop,
            rowH,
            { width: dateW, align: "center" },
          ),
        ),
      );
      tr.add(
        doc.struct("TD", { actual: label(day.pickups) }, () => {
          tonesOf(day).forEach((tone, i) => {
            const line = Math.floor(i / grid.perLine);
            const col = i % grid.perLine;
            drawMark(
              doc,
              tone,
              x + dateW + TABLE_PAD + cellMark / 2 + col * (cellMark + cellGap),
              rowTop + line * rowH + rowH / 2,
              cellMark,
            );
          });
        }),
      );
      top += lines * rowH;
      breaks.push(top);
    }
    const bottom = body + grid.bodyRows * rowH;
    for (let t = top + rowH; t < bottom; t += rowH) breaks.push(t);
    table.end();
    artifact(doc, () => {
      doc.lineWidth(LINE_W).strokeColor(RULE);
      doc.rect(x, y, w, bottom - y).stroke();
      for (const t of [head, body, ...breaks.filter((t) => t < bottom)]) {
        doc
          .moveTo(x, t)
          .lineTo(x + w, t)
          .stroke();
      }
      doc
        .moveTo(x + dateW, head)
        .lineTo(x + dateW, bottom)
        .stroke();
    });
  };

  // ------------------------------------------------------------ guide
  // „Co wrzucać”, one page, the same for every address: six equal tiles
  // for the bins in a 3 × 2 grid (a coloured header with the icon, name and
  // bin; then „Tak” and „Nie”), the waste handed in separately (four equal
  // items in a row: icon, name, where), the PSZOK line beside the QR code
  // to the full rules, and one footer line. Sized once for every gmina's
  // guide (GUIDES): the largest text of the scale at which the longest
  // content of any of them fits, so nothing ever overflows; a gmina with
  // fewer entries leaves its cells empty.
  const TILE_PAD = 2 * U;
  const ICON = 6 * U;
  const ITEM_ICON = 3 * U;
  const BIN_COLUMNS = 3;
  const BIN_ROWS = 2;
  const SEPARATE_COLUMNS = 4;
  const QR_GUIDE = 16 * U;
  const separateHeading = "Oddajesz osobno";
  // Under the band, the same gap as page 1's (Jakub, t360); between the
  // guide's blocks, the tiles' own gutter.
  const guideTop = bandH + GRID_GAP;
  // Rows for the longest source list of any gmina's guide: one height
  // on every PDF.
  const footer2 = guide
    ? footerBlock(
        Math.max(
          ...Object.keys(GUIDES).flatMap((gmina) => {
            const g = guideFor(gmina);
            return g ? [rowsOf(sourcesFooter(g))] : [];
          }),
        ),
      )
    : null;
  type Item = GuideItem;
  const itemName = (item: Item) => TONE_LABEL[item.subtype] ?? item.subtype;
  // Where separately handed-in waste goes, as its source says; the
  // collection only where this address's calendar has its dates.
  const inCalendar = new Set(inWindow.flatMap(tonesOf));
  const whereText = (item: Item, all = false) => {
    // One order on every item: the PSZOK first, then the collection.
    const order: string[] = ["pszok", "zbiorka"];
    const wheres = [...(item.where ?? [])].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    const parts = wheres.flatMap((where) =>
      where === "pszok"
        ? ["PSZOK"]
        : all || inCalendar.has(item.subtype)
          ? ["zbiórka – terminy w kalendarzu"]
          : [],
    );
    const text = parts.join(" lub ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const pszokText = (g: NonNullable<typeof guide>) =>
    `Odpady niebezpieczne (${g.pszok.items.join(", ")}) oddaj: ${g.pszok.place}.`;
  const allGuides = Object.keys(GUIDES).flatMap((gmina) => {
    const g = guideFor(gmina);
    return g ? [g] : [];
  });
  const allBins = allGuides.flatMap((g) => g.bins);
  const allSeparate = allGuides.flatMap((g) => g.separate);
  /** Whether every word of text fits width on its own line. */
  const wordsFit = (font: string, size: number, text: string, width: number) =>
    text.split(/\s+/).every((word) => widthOf(font, size, word) <= width);
  const binW = (CONTENT_W - GUTTER * (BIN_COLUMNS - 1)) / BIN_COLUMNS;
  const sepW = (CONTENT_W - GUTTER * (SEPARATE_COLUMNS - 1)) / SEPARATE_COLUMNS;
  // The QR code's box is the last tile column; the PSZOK line the rest.
  const redW = CONTENT_W - binW - GUTTER;
  const guidePlan = (() => {
    if (!guide || !footer2) return null;
    const plans = [TYPE.body, TYPE.small, TYPE.fine].map((size) => {
      const nameW = binW - 2 * TILE_PAD - ICON - 2 * U;
      // The header pads its text by U above and below, TILE_PAD at the
      // sides: the icon (ICON) sets its least height.
      const headH = onScale(
        2 * U +
          Math.max(
            ICON,
            ...allBins.map(
              (tile) =>
                block("bold", size, itemName(tile), nameW) +
                (tile.container
                  ? block("regular", size, tile.container, nameW)
                  : 0),
            ),
          ),
      );
      const itemW = binW - 2 * TILE_PAD - ITEM_ICON - U;
      const area = (pick: (tile: Item) => string[]) =>
        Math.max(
          0,
          ...allBins.map((tile) =>
            pick(tile).length
              ? ROW[size] +
                pick(tile).reduce(
                  (sum, item) => sum + block("regular", size, item, itemW),
                  0,
                )
              : 0,
          ),
        );
      const yesH = area((tile) => tile.short.yes);
      const noH = area((tile) => tile.short.no);
      const binNeed =
        headH + TILE_PAD + yesH + (noH ? 2 * U + noH : 0) + TILE_PAD;
      const sepNameW = sepW - 2 * TILE_PAD - ICON - 2 * U;
      const sepHeadH = onScale(
        2 * U +
          Math.max(
            ICON,
            ...allSeparate.map((item) =>
              block("bold", size, itemName(item), sepNameW),
            ),
          ),
      );
      const whereW = sepW - 2 * TILE_PAD;
      const sepBodyH =
        2 * TILE_PAD +
        Math.max(
          ROW[size],
          ...allSeparate.map((item) =>
            block("regular", size, whereText(item, true), whereW),
          ),
        );
      const sepH = ROW[size] + U + sepHeadH + sepBodyH;
      const textW = redW - 2 * TILE_PAD - ICON - 2 * U;
      const stripH = Math.max(
        2 * TILE_PAD + QR_GUIDE,
        2 * TILE_PAD +
          Math.max(
            ...allGuides.map((g) => block("bold", size, pszokText(g), textW)),
          ),
      );
      const fitsWords =
        allBins.every(
          (tile) =>
            wordsFit("bold", size, itemName(tile), nameW) &&
            wordsFit("regular", size, tile.container ?? "", nameW) &&
            [...tile.short.yes, ...tile.short.no].every((item) =>
              wordsFit("regular", size, item, itemW),
            ),
        ) &&
        allSeparate.every(
          (item) =>
            wordsFit("bold", size, itemName(item), sepNameW) &&
            wordsFit("regular", size, whereText(item, true), whereW),
        );
      const stripTop = footer2.top - GUTTER - stripH;
      console.error(
        "DBG",
        JSON.stringify({
          size,
          headH,
          yesH,
          noH,
          binNeed,
          sepH,
          sepHeadH,
          sepBodyH,
          stripH,
          f2: footer2.top,
          guideTop,
        }),
      );
      const sepTop = stripTop - GUTTER - sepH;
      const binH =
        (sepTop - GUTTER - guideTop - GUTTER * (BIN_ROWS - 1)) / BIN_ROWS;
      return {
        size,
        headH,
        yesH,
        nameW,
        itemW,
        sepNameW,
        sepHeadH,
        sepBodyH,
        whereW,
        textW,
        stripH,
        stripTop,
        sepTop,
        binH,
        fits: fitsWords && binNeed <= binH,
      };
    });
    return plans.find((plan) => plan.fits) ?? plans[plans.length - 1];
  })();

  const drawTile = (tile: Item, x: number, y: number) => {
    if (!guidePlan) return;
    const { size, binH: h, headH, yesH, nameW, itemW } = guidePlan;
    const w = binW;
    const fill = WASTE[TOKEN[tile.subtype]];
    const onFill = ink(fill);
    const section = doc.struct("Sect");
    root.add(section);
    artifact(doc, () => {
      doc.rect(x, y, w, headH).fillColor(fill).fill();
      doc.rect(x, y, w, h).lineWidth(LINE_W).strokeColor(RULE).stroke();
      drawIcon(
        doc,
        FRACTION_ICONS[TOKEN[tile.subtype]],
        x + TILE_PAD,
        y + (headH - ICON) / 2,
        ICON,
        onFill,
      );
    });
    // Name and bin, together centred in the header.
    const nameH = block("bold", size, itemName(tile), nameW);
    const containerH = tile.container
      ? block("regular", size, tile.container, nameW)
      : 0;
    const nx = x + TILE_PAD + ICON + 2 * U;
    const ny = y + (headH - nameH - containerH) / 2;
    tag(section, "H2", () =>
      blockText("bold", size, onFill, itemName(tile), nx, ny, nameW),
    );
    if (tile.container) {
      const container = tile.container;
      tag(section, "P", () =>
        blockText("regular", size, onFill, container, nx, ny + nameH, nameW),
      );
    }
    const list = (
      heading: string,
      icon: typeof PDF_ICONS.yes,
      colour: string,
      items: string[],
      top: number,
    ) => {
      if (!items.length) return;
      artifact(doc, () =>
        drawIcon(
          doc,
          icon,
          x + TILE_PAD,
          top + (ROW[size] - ITEM_ICON) / 2,
          ITEM_ICON,
          colour,
        ),
      );
      tag(section, "H3", () =>
        rowText(
          "bold",
          size,
          BLACK,
          heading,
          x + TILE_PAD + ITEM_ICON + U,
          top,
          ROW[size],
        ),
      );
      const l = doc.struct("L");
      section.add(l);
      let cy = top + ROW[size];
      for (const item of items) {
        const itemTop = cy;
        artifact(doc, () => {
          doc
            .circle(
              x + TILE_PAD + ITEM_ICON / 2,
              itemTop + ROW[size] / 2,
              size * 0.13,
            )
            .fillColor(BLACK)
            .fill();
        });
        tag(l, "LI", () =>
          blockText(
            "regular",
            size,
            BLACK,
            item,
            x + TILE_PAD + ITEM_ICON + U,
            itemTop,
            itemW,
          ),
        );
        cy += block("regular", size, item, itemW);
      }
      l.end();
    };
    const yesTop = y + headH + TILE_PAD;
    list(
      "Tak",
      PDF_ICONS.yes,
      GOVUK_FUNCTIONAL.success,
      tile.short.yes,
      yesTop,
    );
    list(
      "Nie",
      PDF_ICONS.no,
      GOVUK_FUNCTIONAL.error,
      tile.short.no,
      yesTop + yesH + 2 * U,
    );
    section.end();
  };

  // Waste handed in separately: a heading, then equal items in a row, each
  // a coloured header (icon, name) over where it goes.
  const drawSeparate = () => {
    if (!guide || !guidePlan || guide.separate.length === 0) return;
    const { size, sepTop, sepNameW, sepHeadH, sepBodyH, whereW } = guidePlan;
    const section = doc.struct("Sect");
    root.add(section);
    tag(section, "H2", () =>
      rowText("bold", size, BLACK, separateHeading, MARGIN, sepTop, ROW[size]),
    );
    const top = sepTop + ROW[size] + U;
    const list = doc.struct("L");
    section.add(list);
    guide.separate.forEach((item, i) => {
      const x = MARGIN + i * (sepW + GUTTER);
      const fill = WASTE[TOKEN[item.subtype]];
      const onFill = ink(fill);
      artifact(doc, () => {
        doc.rect(x, top, sepW, sepHeadH).fillColor(fill).fill();
        doc
          .rect(x, top, sepW, sepHeadH + sepBodyH)
          .lineWidth(LINE_W)
          .strokeColor(RULE)
          .stroke();
        drawIcon(
          doc,
          FRACTION_ICONS[TOKEN[item.subtype]],
          x + TILE_PAD,
          top + (sepHeadH - ICON) / 2,
          ICON,
          onFill,
        );
      });
      const li = doc.struct("LI");
      list.add(li);
      const name = itemName(item);
      const nameH = block("bold", size, name, sepNameW);
      tag(li, "P", () =>
        blockText(
          "bold",
          size,
          onFill,
          name,
          x + TILE_PAD + ICON + 2 * U,
          top + (sepHeadH - nameH) / 2,
          sepNameW,
        ),
      );
      const where = whereText(item);
      tag(li, "P", () =>
        blockText(
          "regular",
          size,
          BLACK,
          where,
          x + TILE_PAD,
          top + sepHeadH + TILE_PAD,
          whereW,
        ),
      );
      li.end();
    });
    list.end();
    section.end();
  };

  const drawStrip = () => {
    if (!guide || !guidePlan) return;
    const { size, stripH, stripTop, textW } = guidePlan;
    const full = guide.fullRules.url;
    const host = new URL(full).host.replace(/^www\./, "");
    const qrX0 = PAGE_W - MARGIN - binW;
    const onRed = ink(RED);
    const pszok = pszokText(guide);
    const textX = MARGIN + TILE_PAD + ICON + 2 * U;
    const textH = block("bold", size, pszok, textW);
    // The caption beside the QR code, at the page's size if it fits.
    const capW = binW - 2 * TILE_PAD - QR_GUIDE - 2 * U;
    const capSize =
      [size, TYPE.fine].find(
        (s) =>
          widthOf("bold", s, "Pełne zasady:") <= capW &&
          widthOf("regular", s, host) <= capW,
      ) ?? TYPE.fine;
    const section = doc.struct("Sect");
    root.add(section);
    artifact(doc, () => {
      doc.rect(MARGIN, stripTop, redW, stripH).fillColor(RED).fill();
      drawIcon(
        doc,
        PDF_ICONS.hazard,
        MARGIN + TILE_PAD,
        stripTop + (stripH - ICON) / 2,
        ICON,
        onRed,
      );
      doc
        .rect(qrX0, stripTop, binW, stripH)
        .lineWidth(LINE_W)
        .strokeColor(RULE)
        .stroke();
      drawQr(
        doc,
        full,
        qrX0 + TILE_PAD,
        stripTop + (stripH - QR_GUIDE) / 2,
        QR_GUIDE,
      );
    });
    tag(section, "P", () =>
      blockText(
        "bold",
        size,
        onRed,
        pszok,
        textX,
        stripTop + (stripH - textH) / 2,
        textW,
      ),
    );
    const capX = qrX0 + TILE_PAD + QR_GUIDE + 2 * U;
    const capH = 2 * ROW[capSize];
    const capY = stripTop + (stripH - capH) / 2;
    tag(section, "P", () => {
      rowText(
        "bold",
        capSize,
        BLACK,
        "Pełne zasady:",
        capX,
        capY,
        ROW[capSize],
      );
      rowText(
        "regular",
        capSize,
        BLACK,
        host,
        capX,
        capY + ROW[capSize],
        ROW[capSize],
        {
          link: full,
        },
      );
    });
    section.end();
  };

  const drawGuide = () => {
    if (!guide || !guidePlan || !footer2) return;
    doc.addPage();
    drawBand(root);
    guide.bins.forEach((tile, i) => {
      const col = i % BIN_COLUMNS;
      const row = Math.floor(i / BIN_COLUMNS);
      drawTile(
        tile,
        MARGIN + col * (binW + GUTTER),
        guideTop + row * (guidePlan.binH + GUTTER),
      );
    });
    drawSeparate();
    drawStrip();
    footer2.draw(root, [sourcesFooter(guide)]);
  };

  // ------------------------------------------------------------ calendar
  // Every month of the window on page 1 (the grid is sized for the most any
  // month can hold), each titled with its month and year (Jakub, t358);
  // then the key and the footer line.
  drawBand(root);
  let y = gridTop;
  for (const row of tableRows(
    printed.map((key) => ({ key })),
    grid.columns,
  )) {
    row.keys.forEach((key, column) => {
      drawMonth(key, MARGIN + column * (grid.tableW + MONTH_GUTTER), y);
    });
    y += tableH + ROW_GAP;
  }
  const key = keyFor(printed);
  drawKey(root, key, keyTop);
  if (key.moved) drawMoved(root, keyTop);
  footer1.draw(
    root,
    unverified ? [scheduleFooter, unverified] : [scheduleFooter],
  );

  // Page 2, „Co wrzucać”: the last page.
  drawGuide();

  root.end();
  doc.end();
  return done;
}

// Prerendered for every place at build and re-rendered with the dataset
// (its tag), as the waste subpage; a place with no dates to print, a 404;
// any other id, the prerendered 404 (dynamicParams = false). Vercel's own
// cache headers apply: only the type and disposition are ours.
export const dynamic = "error";
export const dynamicParams = false;
export const generateStaticParams = placeParams;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/adres/[id]/harmonogram.pdf">,
) {
  const { id } = await ctx.params;
  const { view: place } = await pageData(pdfPage(id));
  if (!place || !hasUpcoming(place.days, place.today))
    return new Response(null, { status: 404 });
  const pdf = await render(place, `${SITE_URL}${wastePath(place)}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="harmonogram-${fileSlug(place.label)}.pdf"`,
    },
  });
}
