import { readFileSync } from "node:fs";
import path from "node:path";
import { create, type Font } from "fontkit";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/config.generated";
import { readableInk } from "@/lib/contrast";
import { longDate, monthTitle } from "@/lib/date-labels";
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
import { chooseGrid, dateRows, headed, tableRows } from "@/lib/pdf-grid";
import { drawIcon, FRACTION_ICONS, PDF_ICONS } from "@/lib/pdf-icon";
import { scheduleName } from "@/lib/places";
import {
  getPlace,
  movedTarget,
  type Pickup,
  type PickupDay,
  type PlaceView,
  type WasteMaxima,
  wasteMaxima,
} from "@/lib/schedule";
import { hasUpcoming, laterNote, putOutNote } from "@/lib/schedule-notes";
import { SITE_NAME } from "@/lib/share";
import { GUIDES, type GuideItem, guideFor } from "@/lib/sorting-guide";
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
// page 2, „Co wrzucać”, the same for every address: equal tiles for the
// bins and a row for the waste handed in separately, from the gmina's own
// rules (lib/sorting-guide.ts) with Lucide's icons, the PSZOK line beside the
// QR code to the full rules, one footer line; then the text-only version,
// for screen readers and black-and-white use.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
// The spacing scale: every gap, padding and size a multiple of U.
const U = 4;
const MARGIN = 7 * U;
/** Between month tables and between tiles: one gutter for both grids. */
const GUTTER = 2 * U;
/** Between the page's blocks: band, note, grid, key, footer. */
const SECTION = 4 * U;
/** A table cell's inner padding: the headers breathe, as the leaflet's. */
const TABLE_PAD = 2 * U;
/** Every border and rule: one weight, one colour (RULE, below). */
const LINE_W = 0.5;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;

/** The site's type scale at its physical size: CSS px × 0.75 = pt. */
const px = (n: number) => n * 0.75;

/** The type scale: GOV.UK's sizes in pt, and one under them for fine print. */
const TYPE = {
  fine: 9,
  // The month tables' text, headers and days alike, where 16px is just too
  // wide for five columns.
  table: px(15),
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

function render(
  place: PlaceView,
  url: string,
  maxima: WasteMaxima,
): Promise<Buffer> {
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

  // ------------------------------------------------------------ footer line
  // One short line a page: the source, the day it was checked, and that we
  // are not an office. The sources in full stay on the site.
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
    return keyOf(
      keyTones,
      days.some((day) => moved(day)),
    );
  };
  /** The key's items, placed in rows: these marks, then a moved date's. */
  const keyOf = (unsorted: string[], anyMoved: boolean) => {
    const keyTones = [...unsorted].sort(
      (a, b) => KEY_ORDER.indexOf(a) - KEY_ORDER.indexOf(b),
    );
    const items: KeyItem[] = [
      ...keyTones.map((tone) => ({
        label: toneLabel(tone),
        draw: (x: number, cy: number) =>
          drawMark(doc, tone, x + MARK / 2, cy, MARK),
      })),
      // Only what the data marks: a date moved from its usual day.
      ...(anyMoved
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
  // The day number only, as the leaflet's.
  const dateText = (day: PickupDay) => String(Number(day.date.slice(8)));
  const widthOf = (font: string, size: number, text: string) => {
    doc.font(font).fontSize(size);
    return doc.widthOfString(text);
  };
  /** Up to the next step of the scale. */
  const onScale = (n: number) => Math.ceil(n / U) * U;
  const YEAR_H = ROW[TYPE.heading] + U;
  const ROW_GAP = 3 * U;
  const footer1 = footerLine(
    footerText(
      scheduleName(place.gmina),
      oldest(place.sources.map((s) => s.checkedAt)),
    ),
  );
  // Sized once for the largest calendar any address prints (lib/schedule.ts
  // wasteMaxima): every month of the window, each as full as the fullest
  // month in the data, under the tallest band (a one-line title and its
  // day line) and above the tallest key of any zone. Every address gets the same
  // tables; fewer months leave the space below them empty.
  const keyMax = [
    keyFor(printed),
    ...maxima.keys.map((key) => keyOf(key.tones, key.moved)),
  ].reduce((tallest, key) => (key.h > tallest.h ? key : tallest));
  // The footer line at its larger size, whichever this one takes.
  const footerTop = Math.min(
    footer1.top,
    PAGE_H - MARGIN - ROW[TYPE.small] - 2 * U,
  );
  const keyTop = footerTop - SECTION - keyMax.h;
  const bandMax = Math.max(
    bandH,
    Math.max(titleTop + ROW[TYPE.title] + U + ROW[TYPE.body], rightBottom) +
      MARGIN,
  );
  const gridTop = bandMax + noteH + SECTION;
  const gridMonths = months.map((key) => ({
    key,
    marks: (byMonth.get(key) ?? []).map((day) => tonesOf(day).length),
  }));
  // The tables as large as that page allows: the largest text of the scale
  // (with its marks) whose grid fits, its rows then as tall as fill the
  // space down to the key (in half points: the one size not on U, so the
  // tables use the whole page).
  // As the leaflet's: nothing bold, headers the days' size, set apart only
  // by the grey; every table text TABLE_PAD in from its borders.
  const tableSizes = [
    { size: TYPE.heading, mark: 14 },
    { size: TYPE.body, mark: 12 },
    { size: TYPE.small, mark: MARK },
    { size: TYPE.table, mark: MARK },
  ];
  const layouts = tableSizes.map(({ size, mark }) => {
    const dateW = onScale(
      Math.max(
        widthOf("regular", size, "Dzień"),
        ...inWindow.map((day) => widthOf("regular", size, dateText(day))),
      ) +
        2 * TABLE_PAD,
    );
    const grid = chooseGrid({
      months: gridMonths,
      profiles: maxima.profiles,
      width: CONTENT_W,
      gap: GUTTER,
      height: keyTop - SECTION - gridTop,
      yearH: YEAR_H,
      rowGap: ROW_GAP,
      dateW,
      minMarksW: onScale(widthOf("regular", size, "Odpady") + 2 * TABLE_PAD),
      pad: TABLE_PAD,
      mark,
      markGap: MARK_GAP,
      maxColumns: 6,
      minColumns: 2,
      maxRow: 2 * ROW[size],
      minRow: ROW[size],
      rowStep: 0.5,
    });
    return { size, mark, dateW, grid };
  });
  const {
    size: cellSize,
    mark: cellMark,
    dateW,
    grid,
  } = layouts.find((layout) => layout.grid.fits) ?? layouts[layouts.length - 1];
  const rowH = grid.rowH;
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
    tag(root, "H3", () =>
      rowText(
        "regular",
        cellSize,
        BLACK,
        monthName(key),
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
              x +
                dateW +
                TABLE_PAD +
                cellMark / 2 +
                col * (cellMark + MARK_GAP),
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
  const guideTop = compactH + SECTION;
  const footer2 = guide
    ? footerLine(
        footerText(
          `zasady segregacji, ${guide.publisher}`,
          oldest(guide.sources.map((s) => s.checkedAt)),
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
      // The footer line at its larger size, whichever this one takes.
      const footerTop = Math.min(
        footer2.top,
        PAGE_H - MARGIN - ROW[TYPE.small] - 2 * U,
      );
      const stripTop = footerTop - SECTION - stripH;
      const sepTop = stripTop - SECTION - sepH;
      const binH =
        (sepTop - SECTION - guideTop - GUTTER * (BIN_ROWS - 1)) / BIN_ROWS;
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
    compactBand("co wrzucać do pojemników", root);
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
  // This address's months, from the top left, in the grid's columns.
  const placedRows = tableRows(
    printed.map((key) => ({ key })),
    grid.columns,
  );
  const heads = headed(placedRows);
  placedRows.forEach((row, i) => {
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
      drawMonth(key, MARGIN + column * (grid.tableW + GUTTER), y);
    });
    pageKeys.push(...row.keys);
    y += tableH + ROW_GAP;
  });
  endPage(firstPage);

  drawGuide();

  // ------------------------------------------------------------ text version
  // No colours and no marks: the address's day, then the same dates as a
  // list, and the pages' one footer line (the sources stay on the site).
  doc.addPage();
  y = compactBand("wersja tekstowa", root) + SECTION;
  const textBottom = footer1.top - 3 * U;
  // One leading for the page's 19px text: paragraphs, list items and their
  // wrapped lines alike.
  const bodyGap = 2;
  if (dayLine) {
    const top = y;
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(px(19))
        .fillColor(BLACK)
        .text(`${dayLine}.`, MARGIN, top, {
          width: CONTENT_W,
          lineGap: bodyGap,
        });
    });
    y = doc.y + 10;
  }

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
  // Months after the last date, and the year after, in one short line.
  gap = [];
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
      artifact(doc, () => footer1.draw(null));
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
  footer1.draw(root);

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

  const pdf = await render(
    place,
    `${SITE_URL}${wastePath(place)}`,
    await wasteMaxima(),
  );
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
