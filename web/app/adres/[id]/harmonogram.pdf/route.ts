import { readFileSync } from "node:fs";
import path from "node:path";
import { create, type Font } from "fontkit";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/config.generated";
import { readableInk } from "@/lib/contrast";
import { longDate, monthTitle, weekdayShort } from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { datasetHeaders } from "@/lib/gate";
import { GOVUK_COLOUR, GOVUK_FUNCTIONAL } from "@/lib/govuk-colours";
import { TEXT_PLAIN } from "@/lib/headers";
import { withHouseNumber } from "@/lib/house";
import { NOINDEX } from "@/lib/indexing";
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
import { type Block, flow, type Spot } from "@/lib/pdf-flow";
import { chooseGrid, dateRows, headed } from "@/lib/pdf-grid";
import { drawIcon, FRACTION_ICONS, PDF_ICONS } from "@/lib/pdf-icon";
import { scheduleName } from "@/lib/places";
import {
  getPlace,
  movedTarget,
  type Pickup,
  type PickupDay,
  type PlaceView,
} from "@/lib/schedule";
import {
  disclaimer,
  hasUpcoming,
  laterNote,
  putOutNote,
  unverifiedNote,
} from "@/lib/schedule-notes";
import { SITE_NAME } from "@/lib/share";
import { guideFor } from "@/lib/sorting-guide";
import { THEME_COLOR } from "@/lib/theme";
import { FRACTIONS, TOKEN, tones } from "@/lib/waste-bin";
import { WASTE_COLOURS as WASTE } from "@/lib/waste-colours";
import { wastePath } from "@/lib/waste-module";

// Printed QR codes and links point at the waste subpage
// (/adres/<id>/smieci, with the house number) on the permanent address
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
// look, on one spacing scale (U, 4 pt) and one type scale (TYPE): page 1 is
// the whole published period on one page (the cherry band with the "ul."
// plate and the QR code, one GOV.UK Warning line, identical bordered month
// tables in a strict grid (lib/pdf-grid.ts), the key, one footer line);
// page 2, „Co wrzucać”, equal tiles from the gmina's own rules
// (lib/sorting-guide.ts) with Lucide's icons, the PSZOK line beside the QR
// code to the full rules, one footer line; then the text-only version, for
// screen readers and black-and-white use, with every source in full.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
// The spacing scale: every gap, padding and size a multiple of U.
const U = 4;
const MARGIN = 7 * U;
/** Between month tables and between tiles: one gutter for both grids. */
const GUTTER = 2 * U;
/** Between the page's blocks: band, note, grid, key, footer. */
const SECTION = 4 * U;
/** A table cell's inner padding. */
const PAD = U;
/** Every border and rule: one weight, one colour (RULE, below). */
const LINE_W = 0.5;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;

/** The site's type scale at its physical size: CSS px × 0.75 = pt. */
const px = (n: number) => n * 0.75;

/** The type scale: GOV.UK's sizes in pt, and one under them for fine print. */
const TYPE = {
  fine: 9,
  small: px(16),
  body: px(19),
  heading: px(24),
  title: px(36),
} as const;

// Atkinson Hyperlegible Next's vertical metrics, in em. PDFKit sets a line
// from the top of its ascender (0.984), so the baseline is ASCENT below y and
// the cap height (0.668) starts CAP_TOP below it. Spacing is measured to the
// ink: inkOf() gives a text's own glyphs.
const ASCENT = 0.984;
const LINE = ASCENT + 0.316;
const CAP = 0.668;
const CAP_TOP = ASCENT - CAP;

/** Each size's row on the scale, and the gap PDFKit adds for that pitch. */
const ROW: Record<number, number> = {
  [TYPE.fine]: 3 * U,
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
const BORDER = GOVUK_FUNCTIONAL.border;
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

/** The key's order, as the site lists fractions; the key holds tones only. */
const KEY_ORDER = FRACTIONS.map(({ subtype }) => subtype);

/** Fallback names for a tone shown in the key on its own. */
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
  const r = s / 2;
  doc.save().lineJoin("round");
  if (typeof mark === "string") {
    doc
      .rect(cx - r, cy - r, s, s)
      .lineWidth(s * 0.09)
      .strokeColor(BLACK)
      .stroke();
    // Centred by its ink, as the dates are: equal space on every side.
    const size = s * 0.8;
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
      doc.lineWidth(s * 0.09).fillAndStroke(mark.fill, mark.stroke);
    else doc.fillColor(mark.fill).fill();
  };
  switch (mark.shape) {
    case "circle":
      doc.circle(cx, cy, r);
      fill();
      break;
    case "ring":
      doc
        .circle(cx, cy, r - s * 0.13)
        .lineWidth(s * 0.26)
        .strokeColor(mark.fill)
        .stroke();
      break;
    case "square":
      doc.rect(cx - r * 0.9, cy - r * 0.9, r * 1.8, r * 1.8);
      fill();
      break;
    case "triangle":
      doc.polygon(
        [cx, cy - r * 0.95],
        [cx + r * 1.05, cy + r * 0.95],
        [cx - r * 1.05, cy + r * 0.95],
      );
      fill();
      break;
    case "diamond":
      doc.polygon(
        [cx, cy - r * 1.1],
        [cx + r * 0.95, cy],
        [cx, cy + r * 1.1],
        [cx - r * 0.95, cy],
      );
      fill();
      break;
    case "star": {
      const points: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.48;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push([cx + rr * Math.cos(a), cy + 0.05 * s + rr * Math.sin(a)]);
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

/** Largest size, down to min, at which text fits one line. */
function fitSize(
  doc: PDFKit.PDFDocument,
  font: string,
  text: string,
  width: number,
  max: number,
  min: number,
): number {
  for (let size = max; size > min; size -= 0.25) {
    doc.font(font).fontSize(size);
    if (doc.widthOfString(text) <= width) return size;
  }
  return min;
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

/** The current month and the 11 after it, as "YYYY-MM". */
function windowMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: MONTHS }, (_, i) => {
    const y = year + Math.floor((month + i) / 12);
    const m = ((month + i) % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

function weekdayName(iso: string): string {
  return absoluteDay(iso).split(",")[0];
}

/**
 * The weekday of at least three in four pickups, or null when there is no
 * single usual day (then every date shows its weekday and none is marked).
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

function monthName(key: string): string {
  return monthTitle(`${key}-01`).replace(/ \d{4}$/, "");
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

/** Consecutive months without data, as "styczeń–wrzesień 2027" or "2027". */
function emptyRange(keys: string[]): string {
  const first = keys[0];
  const last = keys[keys.length - 1];
  const name = (key: string) => monthName(key).toLowerCase();
  if (first === last) return `${name(first)} ${first.slice(0, 4)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) {
    // The rest of the window from January: just the year.
    if (first.endsWith("-01")) return first.slice(0, 4);
    return `${name(first)}–${name(last)} ${last.slice(0, 4)}`;
  }
  return `${name(first)} ${first.slice(0, 4)} – ${name(last)} ${last.slice(0, 4)}`;
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
  // Only months with dates are printed, up to the last published one.
  const printed = months.filter((key) => byMonth.has(key));
  const laterText = laterNote(place.days);
  const usual = usualWeekday(inWindow);
  const odd = (day: PickupDay) =>
    usual !== null && weekdayName(day.date) !== usual;
  const putOutBy = inWindow
    .flatMap((day) => day.pickups)
    .find((p) => p.putOutBy)?.putOutBy;
  const putOut = putOutBy ? putOutNote(putOutBy) : null;
  const title = withHouseNumber(place.name, place.nr);
  const dayLine = usual ? `Twój dzień odbioru: ${usual}` : null;
  // Each fraction's name as the data gives it; a fraction met only inside a
  // combined pickup takes the site's.
  const toneLabels = new Map<string, string>();
  for (const pickup of inWindow.flatMap((day) => day.pickups)) {
    for (const tone of tones(pickup.subtype)) {
      if (toneLabels.has(tone)) continue;
      toneLabels.set(
        tone,
        pickup.subtype === tone
          ? pickup.label
          : (TONE_LABEL[tone] ?? pickup.label),
      );
    }
  }
  const toneLabel = (tone: string) =>
    toneLabels.get(tone) ?? TONE_LABEL[tone] ?? tone;
  // Page 2: what goes in each of the place's bins, from its gmina's own
  // rules (lib/sorting-guide.ts); none without them.
  const guide = guideFor(place.gmina, place.fractions);

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
      Title: `Harmonogram odbioru odpadów – ${withHouseNumber(place.label, place.nr)}`,
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
    parent: PDFKit.PDFStructureElement | null,
    type: string,
    draw: () => void,
    options: { actual?: string } = {},
  ) => {
    if (parent) parent.add(doc.struct(type, options, draw));
    else draw();
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

  // ------------------------------------------------------------ text footer
  // The text version's footer: every source with its link and check day,
  // the disclaimer last; its ink ends MARGIN above the page's edge.
  // Sources at the foot of the page, each with its link and the day it was
  // checked, above an optional bold closing line; the last ink ends MARGIN
  // above the page's edge, a divider ruleGap above the first.
  const small = px(16);
  // A URL never breaks: its own line, smaller if it must.
  const urlSize = (text: string) =>
    fitSize(doc, "regular", text, CONTENT_W, small, 6);
  // One leading for every footer line, wrapped ones and the URL too.
  const footerGap = 2;
  const footerLead = small * LINE + footerGap;
  const ruleW = 0.75;
  const ruleGap = 8;
  /** The footer's divider: decoration in the tagged copy, as is. */
  const divider = (parent: PDFKit.PDFStructureElement | null, at: number) => {
    const rule = () => {
      doc
        .moveTo(MARGIN, at)
        .lineTo(PAGE_W - MARGIN, at)
        .lineWidth(ruleW)
        .strokeColor(BORDER)
        .stroke();
    };
    if (parent) artifact(doc, rule);
    else rule();
  };
  type FooterLine = { text: string; url: string | null };
  const sourceLines = (
    sources: Array<{
      label: string;
      url: string | null;
      checkedAt: string | null;
    }>,
  ): FooterLine[] =>
    sources.map((source) => ({
      text: `Źródło: ${source.label}${source.checkedAt ? ` · Stan na ${longDate(source.checkedAt)}` : ""}`,
      url: source.url,
    }));

  const footer = (lines: FooterLine[], closing: string | null) => {
    let height = 0;
    for (const line of lines) {
      doc.font("regular").fontSize(small);
      height += doc.heightOfString(line.text, {
        width: CONTENT_W,
        lineGap: footerGap,
      });
      if (line.url) height += footerLead;
    }
    if (closing) {
      doc.font("bold").fontSize(small);
      height += doc.heightOfString(closing, {
        width: CONTENT_W,
        lineGap: footerGap,
      });
    }
    const last = lines.at(-1);
    const lastBelow = closing
      ? inkOf("bold", small, closing).below
      : last?.url
        ? inkOf("regular", urlSize(last.url), last.url).below
        : inkOf("regular", small, last?.text ?? "").below;
    const top =
      PAGE_H -
      MARGIN -
      lastBelow -
      (height - footerGap - small * (LINE - ASCENT));
    const firstInk = lines.length
      ? top + small * ASCENT - inkOf("regular", small, lines[0].text).above
      : top + small * ASCENT - inkOf("bold", small, closing ?? "").above;
    const ruleY = firstInk - ruleGap - ruleW / 2;

    const draw = (parent: PDFKit.PDFStructureElement | null) => {
      divider(parent, ruleY);
      let fy = top;
      for (const line of lines) {
        const lineTop = fy;
        doc.font("regular").fontSize(small);
        fy += doc.heightOfString(line.text, {
          width: CONTENT_W,
          lineGap: footerGap,
        });
        // A smaller URL keeps the line's baseline.
        const link = line.url;
        const size = link ? urlSize(link) : small;
        const linkTop = fy + (small - size) * ASCENT;
        tag(parent, "P", () => {
          doc
            .font("regular")
            .fontSize(small)
            .fillColor(SECONDARY_TEXT)
            .text(line.text, MARGIN, lineTop, {
              width: CONTENT_W,
              lineGap: footerGap,
            });
          if (link) {
            doc
              .fontSize(size)
              .text(link, MARGIN, linkTop, { link, lineBreak: false });
          }
        });
        if (link) fy += footerLead;
      }
      if (closing) {
        const closingTop = fy;
        tag(parent, "P", () => {
          doc
            .font("bold")
            .fontSize(small)
            .fillColor(BLACK)
            .text(closing, MARGIN, closingTop, {
              width: CONTENT_W,
              lineGap: footerGap,
            });
        });
      }
    };
    return {
      top,
      ruleY,
      draw,
      artifact: () => artifact(doc, () => draw(null)),
    };
  };

  // ------------------------------------------------------------ footer line
  // One short line a page: the source, the day it was checked, and that we
  // are not an office. The text version lists every source in full.
  const oldest = (days: Array<string | null>) =>
    days.filter((d): d is string => d !== null).sort()[0] ?? null;
  const footerText = (source: string, checked: string | null) =>
    [
      `Źródło: ${source}`,
      ...(checked ? [`stan na ${longDate(checked)}`] : []),
      "Nie jesteśmy urzędem.",
    ].join(" · ");
  const footerLine = (text: string) => {
    const size = fitting("regular", text, CONTENT_W, [TYPE.small, TYPE.fine]);
    const h = block("regular", size, text, CONTENT_W);
    const top = PAGE_H - MARGIN - h;
    const ruleY = top - 2 * U;
    const draw = (parent: PDFKit.PDFStructureElement | null) => {
      if (parent) artifact(doc, () => rule(ruleY));
      else rule(ruleY);
      tag(parent, "P", () =>
        blockText(
          "regular",
          size,
          SECONDARY_TEXT,
          text,
          MARGIN,
          top,
          CONTENT_W,
        ),
      );
    };
    return { top: ruleY, draw };
  };

  // ------------------------------------------------------------ bands
  // The full band on page 1: the plate, where, the street and its day on the
  // left; the QR code and its caption on the right. Rows on the scale, their
  // text cap-centred; MARGIN of padding all round.
  const LOGO_H = 6 * U;
  const qrSize = 20 * U;
  const qrBox = qrSize + 2 * U;
  const qrX = PAGE_W - MARGIN - qrBox;
  const bandTextW = qrX - 6 * U - MARGIN;
  const kicker = `${place.area} · Harmonogram odbioru odpadów`;
  const titleSize = fitting("bold", title, bandTextW, [
    TYPE.title,
    TYPE.heading,
  ]);
  const bandLine = [dayLine, putOut].filter(Boolean).join(" · ");
  const bandLineSize = fitting("bold", bandLine, bandTextW, [
    TYPE.body,
    TYPE.small,
  ]);
  const kickerTop = MARGIN + LOGO_H + 3 * U;
  const titleTop = kickerTop + ROW[TYPE.body];
  const titleH = block("bold", titleSize, title, bandTextW);
  const bandLineTop = titleTop + titleH + U;
  const leftBottom = bandLine
    ? bandLineTop + block("bold", bandLineSize, bandLine, bandTextW)
    : titleTop + titleH;
  const scan = "Zeskanuj: aktualne terminy";
  const scanTop = MARGIN + qrBox + U;
  const rightBottom = scanTop + ROW[TYPE.small];
  const bandH = Math.max(leftBottom, rightBottom) + MARGIN;

  const drawBand = () => {
    artifact(doc, () => {
      doc.rect(0, 0, PAGE_W, bandH).fillColor(HEADER).fill();
      drawLogo(doc, MARGIN, MARGIN, LOGO_H);
      doc.rect(qrX, MARGIN, qrBox, qrBox).fillColor(WHITE).fill();
      drawQr(doc, url, qrX + U, MARGIN + U, qrSize);
    });
    tag(root, "P", () =>
      rowText(
        "regular",
        TYPE.body,
        WHITE,
        kicker,
        MARGIN,
        kickerTop,
        ROW[TYPE.body],
      ),
    );
    tag(root, "H1", () =>
      blockText("bold", titleSize, WHITE, title, MARGIN, titleTop, bandTextW),
    );
    if (bandLine) {
      tag(root, "P", () =>
        blockText(
          "bold",
          bandLineSize,
          WHITE,
          bandLine,
          MARGIN,
          bandLineTop,
          bandTextW,
        ),
      );
    }
    tag(root, "P", () =>
      rowText(
        "regular",
        TYPE.small,
        WHITE,
        scan,
        qrX - 30 * U,
        scanTop,
        ROW[TYPE.small],
        {
          width: 30 * U + qrBox,
          align: "right",
          link: url,
        },
      ),
    );
    return bandH;
  };

  /** Later pages: the plate and one line, with the same padding. */
  const compactH = MARGIN + LOGO_H + 3 * U + ROW[TYPE.body] + MARGIN - U;
  const compactBand = (
    what: string,
    parent: PDFKit.PDFStructureElement | null,
  ) => {
    const text = `${title} · ${what}`;
    const size = fitting("bold", text, CONTENT_W, [TYPE.body, TYPE.small]);
    const plate = () => {
      doc.rect(0, 0, PAGE_W, compactH).fillColor(HEADER).fill();
      drawLogo(doc, MARGIN, MARGIN, LOGO_H);
    };
    const words = () =>
      rowText(
        "bold",
        size,
        WHITE,
        text,
        MARGIN,
        MARGIN + LOGO_H + 3 * U,
        ROW[TYPE.body],
      );
    // A repeated band is decoration as a whole.
    if (parent) {
      artifact(doc, plate);
      tag(parent, "H1", words);
    } else {
      artifact(doc, () => {
        plate();
        words();
      });
    }
    return compactH;
  };

  // ------------------------------------------------------------ note
  // GOV.UK Warning text on a grey band: one line, that dates may change and
  // where to check them.
  const WARN = 7 * U;
  const noteText =
    "Terminy mogą się zmienić – zeskanuj kod, by sprawdzić aktualne.";
  const noteX = MARGIN + WARN + 3 * U;
  const noteW = PAGE_W - MARGIN - noteX;
  const noteRows = block("bold", TYPE.body, noteText, noteW);
  const noteBody = Math.max(WARN, noteRows);
  const noteH = 3 * U + noteBody + 3 * U;
  const drawNote = (top: number) => {
    const mid = top + noteH / 2;
    artifact(doc, () => {
      doc.rect(0, top, PAGE_W, noteH).fillColor(PANEL).fill();
      doc
        .circle(MARGIN + WARN / 2, mid, WARN / 2)
        .fillColor(BLACK)
        .fill();
      // The "!" centred by its ink: it runs from the cap height to 0.012 em
      // below the baseline.
      const size = WARN * 0.72;
      doc.font("bold").fontSize(size).fillColor(WHITE);
      const tw = doc.widthOfString("!");
      doc.text(
        "!",
        MARGIN + WARN / 2 - tw / 2,
        mid - size * (CAP_TOP + 0.68 / 2),
        {
          lineBreak: false,
        },
      );
    });
    // GOV.UK's visually hidden "Warning" prefix, for screen readers.
    tag(
      root,
      "P",
      () =>
        blockText(
          "bold",
          TYPE.body,
          BLACK,
          noteText,
          noteX,
          mid - noteRows / 2,
          noteW,
        ),
      { actual: `Ostrzeżenie: ${noteText}` },
    );
    return top + noteH;
  };

  // ------------------------------------------------------------ key
  // The key above the footer: the marks on the page, then a moved date's
  // cell if the data has one. Rows of 5 U, marks the tables' size.
  const MARK = 10;
  const MARK_GAP = U;
  const KEY_ROW = 5 * U;
  const keyHeading = "Oznaczenia";
  doc.font("bold").fontSize(TYPE.small);
  const keyStart = MARGIN + doc.widthOfString(keyHeading) + 3 * U;
  type KeyItem = { label: string; draw: (x: number, cy: number) => void };
  const keyFor = (keys: string[]) => {
    const days = keys.flatMap((key) => byMonth.get(key) ?? []);
    const keyTones: string[] = [];
    for (const pickup of days.flatMap((day) => day.pickups)) {
      for (const tone of tones(pickup.subtype)) {
        if (!keyTones.includes(tone)) keyTones.push(tone);
      }
    }
    keyTones.sort((a, b) => KEY_ORDER.indexOf(a) - KEY_ORDER.indexOf(b));
    const items: KeyItem[] = [
      ...keyTones.map((tone) => ({
        label: toneLabel(tone),
        draw: (x: number, cy: number) =>
          drawMark(doc, tone, x + MARK / 2, cy, MARK),
      })),
      // Only what the data marks: a date moved from its usual day.
      ...(days.some((day) => moved(day))
        ? [
            {
              label: "Termin przesunięty",
              draw: (x: number, cy: number) => {
                doc
                  .rect(x, cy - MARK / 2 - U / 2, MARK, MARK + U)
                  .fillColor(RED)
                  .fill();
              },
            },
          ]
        : []),
    ];
    let kx = keyStart;
    let row = 0;
    const placed = items.map((item) => {
      doc.font("regular").fontSize(TYPE.small);
      const w = MARK + U + doc.widthOfString(item.label);
      if (kx > keyStart && kx + w > PAGE_W - MARGIN) {
        kx = keyStart;
        row++;
      }
      const at = { ...item, x: kx, row };
      kx += w + 3 * U;
      return at;
    });
    return { placed, h: (row + 1) * KEY_ROW };
  };
  const drawKey = (
    parent: PDFKit.PDFStructureElement | null,
    key: ReturnType<typeof keyFor>,
    top: number,
  ) => {
    tag(parent, "H2", () =>
      rowText("bold", TYPE.small, BLACK, keyHeading, MARGIN, top, KEY_ROW),
    );
    const list = parent ? doc.struct("L") : null;
    if (parent && list) parent.add(list);
    for (const item of key.placed) {
      const rowTop = top + item.row * KEY_ROW;
      const mark = () => item.draw(item.x, rowTop + KEY_ROW / 2);
      if (parent) artifact(doc, mark);
      else mark();
      tag(list, "LI", () =>
        rowText(
          "regular",
          TYPE.small,
          BLACK,
          item.label,
          item.x + MARK + U,
          rowTop,
          KEY_ROW,
        ),
      );
    }
    list?.end();
  };

  // ------------------------------------------------------------ grid
  // Identical month tables, as the leaflet's: a title row, a „Dzień |
  // Odpady” header row on grey, and the same number of body rows in every
  // month (lib/pdf-grid.ts picks the columns and row height); every cell
  // bordered, each border drawn once.
  const dateText = (day: PickupDay) => {
    const n = String(Number(day.date.slice(8)));
    return usual && !moved(day) && !odd(day)
      ? n
      : `${n} ${weekdayShort(day.date)}`;
  };
  const widthOf = (font: string, size: number, text: string) => {
    doc.font(font).fontSize(size);
    return doc.widthOfString(text);
  };
  /** Up to the next step of the scale. */
  const onScale = (n: number) => Math.ceil(n / U) * U;
  const dateW = onScale(
    Math.max(
      widthOf("bold", TYPE.small, "Dzień"),
      ...inWindow.map((day) => widthOf("bold", TYPE.small, dateText(day))),
    ) +
      2 * PAD,
  );
  const minMarksW = onScale(widthOf("bold", TYPE.small, "Odpady") + 2 * PAD);
  const YEAR_H = ROW[TYPE.heading] + U;
  const ROW_GAP = 3 * U;
  const footer1 = footerLine(
    footerText(
      scheduleName(place.gmina),
      oldest(place.sources.map((s) => s.checkedAt)),
    ),
  );
  const keyAll = keyFor(printed);
  const keyTop = footer1.top - SECTION - keyAll.h;
  const gridTop = bandH + noteH + SECTION;
  const grid = chooseGrid({
    months: printed.map((key) => ({
      key,
      marks: (byMonth.get(key) ?? []).map(
        (day) => day.pickups.flatMap((p) => tones(p.subtype)).length,
      ),
    })),
    width: CONTENT_W,
    gap: GUTTER,
    height: keyTop - SECTION - gridTop,
    yearH: YEAR_H,
    rowGap: ROW_GAP,
    dateW,
    minMarksW,
    pad: PAD,
    mark: MARK,
    markGap: MARK_GAP,
    maxColumns: 6,
    minColumns: 2,
    maxRow: 6 * U,
    minRow: 4 * U,
    rowStep: U,
  });
  const rowH = grid.rowH;
  const tableH = (grid.bodyRows + 2) * rowH;

  const drawMonth = (key: string, rowYear: string, x: number, y: number) => {
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
    tag(root, "H3", () =>
      rowText(
        "bold",
        TYPE.small,
        BLACK,
        key.startsWith(rowYear) ? monthName(key) : monthTitle(`${key}-01`),
        x + PAD,
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
        rowText("bold", TYPE.small, BLACK, "Dzień", x, head, rowH, {
          width: dateW,
          align: "center",
        }),
      ),
    );
    headRow.add(
      doc.struct("TH", {}, () =>
        rowText(
          "bold",
          TYPE.small,
          BLACK,
          "Odpady",
          x + dateW + PAD,
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
            "bold",
            TYPE.small,
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
              x + dateW + PAD + MARK / 2 + col * (MARK + MARK_GAP),
              rowTop + line * rowH + rowH / 2,
              MARK,
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
  // „Co wrzucać”, one page: equal tiles in a strict grid (a coloured header
  // with the icon, name and bin; then „Tak” and „Nie” in areas of one
  // height), the PSZOK line beside the QR code to the full rules, and one
  // footer line. Columns and text size: the largest size of the scale that
  // fits, then the fewest empty cells, then the widest tiles.
  const TILE_PAD = 2 * U;
  const ICON = 6 * U;
  const ITEM_ICON = 3 * U;
  const guideTop = compactH + SECTION;
  const footer2 = guide
    ? footerLine(
        footerText(
          `zasady segregacji, ${guide.publisher}`,
          oldest(guide.sources.map((s) => s.checkedAt)),
        ),
      )
    : null;
  const stripH = 2 * TILE_PAD + 16 * U;
  const stripTop = (footer2?.top ?? PAGE_H) - SECTION - stripH;
  type Tile = NonNullable<typeof guide>["tiles"][number];
  const tileName = (tile: Tile) => toneLabel(tile.subtype);
  const guidePlan = (() => {
    if (!guide) return null;
    const n = guide.tiles.length;
    const options = [];
    for (const size of [TYPE.small, TYPE.fine]) {
      for (let columns = 2; columns <= 4; columns++) {
        const rows = Math.ceil(n / columns);
        const w = (CONTENT_W - GUTTER * (columns - 1)) / columns;
        const nameW = w - 2 * TILE_PAD - ICON - 2 * U;
        // The header pads its text by U above and below, TILE_PAD at the
        // sides: the icon (ICON) sets its least height.
        const headH = onScale(
          2 * U +
            Math.max(
              ICON,
              ...guide.tiles.map(
                (tile) =>
                  block("bold", size, tileName(tile), nameW) +
                  (tile.container
                    ? block("regular", size, tile.container, nameW)
                    : 0),
              ),
            ),
        );
        const itemW = w - 2 * TILE_PAD - ITEM_ICON - U;
        const area = (pick: (tile: Tile) => string[]) =>
          Math.max(
            0,
            ...guide.tiles.map((tile) =>
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
        const need =
          headH + TILE_PAD + yesH + (noH ? 2 * U + noH : 0) + TILE_PAD;
        const h = (stripTop - SECTION - guideTop - GUTTER * (rows - 1)) / rows;
        options.push({
          size,
          columns,
          rows,
          w,
          h,
          headH,
          yesH,
          nameW,
          itemW,
          fits: need <= h,
          empty: columns * rows - n,
          need,
        });
      }
    }
    const fits = options.filter((o) => o.fits);
    const pool = fits.length ? fits : options;
    return pool.reduce((best, o) => {
      if (!fits.length) return o.need - o.h < best.need - best.h ? o : best;
      if (o.size !== best.size) return o.size > best.size ? o : best;
      if (o.empty !== best.empty) return o.empty < best.empty ? o : best;
      return o.columns < best.columns ? o : best;
    });
  })();

  const drawTile = (tile: Tile, x: number, y: number) => {
    if (!guidePlan) return;
    const { size, w, h, headH, yesH, nameW, itemW } = guidePlan;
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
    const nameH = block("bold", size, tileName(tile), nameW);
    const binH = tile.container
      ? block("regular", size, tile.container, nameW)
      : 0;
    const nx = x + TILE_PAD + ICON + 2 * U;
    const ny = y + (headH - nameH - binH) / 2;
    tag(section, "H2", () =>
      blockText("bold", size, onFill, tileName(tile), nx, ny, nameW),
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

  const drawStrip = () => {
    if (!guide || !guidePlan) return;
    const { columns, w: tileW } = guidePlan;
    const full = guide.fullRules.url;
    const host = new URL(full).host.replace(/^www\./, "");
    const qr = 16 * U;
    // The QR code and its caption under the fewest of the last columns
    // that hold them (the caption at a size of the scale that fits), the
    // PSZOK line under the rest: the strip keeps the tiles' edges.
    const capFor = (span: number) => {
      const width = span * tileW + (span - 1) * GUTTER;
      const capW = width - 2 * TILE_PAD - qr - 2 * U;
      const size = [TYPE.small, TYPE.fine].find(
        (s) =>
          widthOf("bold", s, "Pełne zasady:") <= capW &&
          widthOf("regular", s, host) <= capW,
      );
      return size ? { span, width, size } : null;
    };
    const cap = Array.from({ length: columns - 1 }, (_, i) =>
      capFor(i + 1),
    ).find(Boolean) ?? { span: columns - 1, width: tileW, size: TYPE.fine };
    const w = cap.width;
    const qrX0 = PAGE_W - MARGIN - w;
    const redW = qrX0 - GUTTER - MARGIN;
    const onRed = ink(RED);
    const pszok = `Odpady niebezpieczne (${guide.pszok.items.join(", ")}) oddaj: ${guide.pszok.place}.`;
    const textX = MARGIN + TILE_PAD + ICON + 2 * U;
    const textW = MARGIN + redW - TILE_PAD - textX;
    const size =
      [TYPE.body, TYPE.small, TYPE.fine].find(
        (s) => block("bold", s, pszok, textW) <= stripH - 2 * TILE_PAD,
      ) ?? TYPE.fine;
    const textH = block("bold", size, pszok, textW);
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
        .rect(qrX0, stripTop, w, stripH)
        .lineWidth(LINE_W)
        .strokeColor(RULE)
        .stroke();
      drawQr(doc, full, qrX0 + TILE_PAD, stripTop + TILE_PAD, qr);
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
    const capX = qrX0 + TILE_PAD + qr + 2 * U;
    const capH = 2 * ROW[cap.size];
    const capY = stripTop + (stripH - capH) / 2;
    tag(section, "P", () => {
      rowText(
        "bold",
        cap.size,
        BLACK,
        "Pełne zasady:",
        capX,
        capY,
        ROW[cap.size],
      );
      rowText(
        "regular",
        cap.size,
        BLACK,
        host,
        capX,
        capY + ROW[cap.size],
        ROW[cap.size],
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
    compactBand("co wrzucać do pojemników", root);
    guide.tiles.forEach((tile, i) => {
      const col = i % guidePlan.columns;
      const row = Math.floor(i / guidePlan.columns);
      drawTile(
        tile,
        MARGIN + col * (guidePlan.w + GUTTER),
        guideTop + row * (guidePlan.h + GUTTER),
      );
    });
    drawStrip();
    footer2.draw(root);
  };

  // ------------------------------------------------------------ calendar
  // Rows that do not fit even at the smallest row height run on, on pages of
  // their own under the compact band.
  let y = drawNote(drawBand()) + SECTION;
  let pageKeys: string[] = [];
  let year = "";
  const yearsTagged = new Set<string>();
  const endPage = (first: boolean) => {
    const key = keyFor(pageKeys);
    const top = footer1.top - SECTION - key.h;
    if (first) drawKey(root, key, top);
    else artifact(doc, () => drawKey(null, key, top));
    if (first) footer1.draw(root);
    else artifact(doc, () => footer1.draw(null));
  };
  let firstPage = true;
  const heads = headed(grid.rows);
  grid.rows.forEach((row, i) => {
    const heading = heads[i] || year === "";
    const need = tableH + (heading ? YEAR_H : 0);
    if (y + need > keyTop - SECTION + 0.01 && pageKeys.length) {
      endPage(firstPage);
      firstPage = false;
      doc.addPage();
      y = compactBand("ciąg dalszy", null) + SECTION;
      pageKeys = [];
      year = "";
    }
    // A year is tagged (H2) once; repeated, it is decoration.
    if (heads[i] || year === "") {
      year = row.year;
      const top = y;
      const draw = () =>
        rowText(
          "bold",
          TYPE.heading,
          BLACK,
          row.year,
          MARGIN,
          top,
          ROW[TYPE.heading],
        );
      if (yearsTagged.has(row.year)) artifact(doc, draw);
      else {
        yearsTagged.add(row.year);
        tag(root, "H2", draw);
      }
      y += YEAR_H;
    }
    row.keys.forEach((key, column) => {
      drawMonth(key, row.year, MARGIN + column * (grid.tableW + GUTTER), y);
    });
    pageKeys.push(...row.keys);
    y += tableH + ROW_GAP;
  });
  endPage(firstPage);

  drawGuide();

  // ------------------------------------------------------------ text version
  // No colours and no marks: the same dates as a list, then every source in
  // full, with its link and the day it was checked, for screen readers.
  const textFooter = footer(
    [
      ...sourceLines(place.sources),
      ...(guide ? sourceLines(guide.sources) : []),
    ],
    disclaimer(place.gmina),
  );
  doc.addPage();
  y = compactBand("wersja tekstowa", root) + SECTION;
  const textBottom = textFooter.top - 3 * U;
  // One leading for the page's 19px text: paragraphs, list items and their
  // wrapped lines alike.
  const bodyGap = 2;
  const intro = [
    ...(dayLine ? [`${dayLine}.`] : []),
    "Te same terminy co w kalendarzu, w formie listy.",
    ...(putOut ? [putOut] : []),
    ...(place.verified ? [] : [unverifiedNote(place.gmina)]),
    "Terminy mogą się zmienić. Aktualne zawsze na stronie:",
  ];
  for (const line of intro) {
    const top = y;
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(px(19))
        .fillColor(BLACK)
        .text(line, MARGIN, top, { width: CONTENT_W, lineGap: bodyGap });
    });
    y = doc.y;
  }
  const link = url.replace("https://", "");
  const linkTop = y;
  const linkSize = fitSize(doc, "bold", link, CONTENT_W, px(19), 8);
  tag(root, "P", () => {
    doc
      .font("bold")
      .fontSize(linkSize)
      .fillColor(BLACK)
      .text(link, MARGIN, linkTop, { link: url, lineBreak: false });
  });
  y += linkSize * LINE + bodyGap + 10;

  // GOV.UK's scale, as on the site: month headings heading-m, the rest body.
  const listSize = px(19);
  const headSize = px(24);

  // Chronological: months with dates in full, gaps collapsed into one line.
  // Months before the first date (e.g. the rest of this month, with no
  // pickups left) are simply skipped.
  type Entry =
    | { kind: "gap"; range: string; text: string }
    | { kind: "month"; title: string; items: string[] };
  const entries: Entry[] = [];
  let gap: string[] = [];
  const flushGap = () => {
    if (gap.length === 0) return;
    entries.push({
      kind: "gap",
      range: `${emptyRange(gap)}: `,
      text: "terminy jeszcze nieogłoszone.",
    });
    gap = [];
  };
  for (const key of months.slice(months.indexOf(printed[0]))) {
    const days = byMonth.get(key);
    if (!days) {
      gap.push(key);
      continue;
    }
    flushGap();
    entries.push({
      kind: "month",
      title: monthTitle(`${key}-01`),
      items: days.map((day) => `${spoken(day)} – ${label(day.pickups)}`),
    });
  }
  flushGap();
  if (laterText) entries.push({ kind: "gap", range: "", text: laterText });

  // Measured first, so a month is never split across pages (lib/pdf-flow).
  const itemH = (text: string) => {
    doc.font("regular").fontSize(listSize);
    return doc.heightOfString(text, {
      width: CONTENT_W - 12,
      lineGap: bodyGap,
    });
  };
  const blocks: Block[] = entries.map((entry) => {
    if (entry.kind === "gap") {
      doc.font("bold").fontSize(listSize);
      const h = doc.heightOfString(entry.range + entry.text, {
        width: CONTENT_W,
        lineGap: bodyGap,
      });
      return { head: h, lines: [], gap: 8 - bodyGap };
    }
    doc.font("bold").fontSize(headSize);
    const head = doc.heightOfString(entry.title, { width: CONTENT_W }) + 3;
    return { head, lines: entry.items.map(itemH), gap: 6 };
  });
  const continuedTop = compactH + SECTION;
  const placed = flow(blocks, y, continuedTop, textBottom);
  let textPageNow = 0;
  const toPage = (spot: Spot) => {
    while (textPageNow < spot.page) {
      textFooter.artifact();
      doc.addPage();
      compactBand("wersja tekstowa, ciąg dalszy", null);
      textPageNow++;
    }
    return spot.y;
  };
  entries.forEach((entry, i) => {
    const at = placed[i];
    if (entry.kind === "gap") {
      const top = toPage(at.head);
      tag(root, "P", () => {
        doc
          .font("bold")
          .fontSize(listSize)
          .fillColor(BLACK)
          .text(entry.range, MARGIN, top, {
            width: CONTENT_W,
            lineGap: bodyGap,
            continued: true,
          })
          .font("regular")
          .text(entry.text);
      });
      return;
    }
    const section = doc.struct("Sect");
    root.add(section);
    const heading = (text: string, top: number) => () => {
      doc
        .font("bold")
        .fontSize(headSize)
        .fillColor(BLACK)
        .text(text, MARGIN, top, { width: CONTENT_W });
    };
    tag(section, "H2", heading(entry.title, toPage(at.head)));
    const list = doc.struct("L");
    section.add(list);
    let continued = 0;
    entry.items.forEach((text, j) => {
      const spot = at.lines[j];
      // A month longer than a page: its heading again, as decoration.
      const repeat = at.continued[continued];
      if (repeat && repeat.page === spot.page) {
        continued++;
        const top = toPage(repeat);
        artifact(doc, heading(`${entry.title} (ciąg dalszy)`, top));
      }
      const top = toPage(spot);
      tag(list, "LI", () => {
        doc
          .font("regular")
          .fontSize(listSize)
          .fillColor(BLACK)
          .text(text, MARGIN + 12, top, {
            width: CONTENT_W - 12,
            lineGap: bodyGap,
          });
      });
    });
    list.end();
    section.end();
  });
  textFooter.draw(root);

  root.end();
  doc.end();
  return done;
}

// A redirect or a 404: an hour at the CDN, without stale-while-revalidate.
const NO_STALE = "public, s-maxage=3600";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const place = await getPlace(id, url.searchParams.get("nr"));
  // A renamed place's old PDF address: the same PDF on its new id.
  const moved = place ? null : await movedTarget(id, url.pathname + url.search);
  if (moved) {
    return new Response(null, {
      status: 308,
      headers: {
        Location: moved,
        ...datasetHeaders(NO_STALE),
      },
    });
  }
  if (!place || !hasUpcoming(place.days, place.today)) {
    return new Response("Nie mamy harmonogramu dla tego adresu.", {
      status: 404,
      headers: {
        ...TEXT_PLAIN,
        ...datasetHeaders(NO_STALE),
        ...NOINDEX,
      },
    });
  }

  const pdf = await render(place, `${SITE_URL}${wastePath(place)}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // With a house number: in the file name too.
      "Content-Disposition": `inline; filename="harmonogram-${fileSlug(withHouseNumber(place.label, place.nr))}.pdf"`,
      ...datasetHeaders(),
      ...NOINDEX,
    },
  });
}
