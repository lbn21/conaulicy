import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/config.generated";
import { longDate, monthTitle, weekdayShort } from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { datasetHeaders } from "@/lib/gate";
import { withHouseNumber } from "@/lib/house";
import { NOINDEX } from "@/lib/indexing";
import {
  HEADER_WORDMARK_SHIFT,
  LOGO_HEIGHT,
  PLATE,
  RIM,
  RIM_WIDTH,
  UL,
  WORDMARK,
} from "@/lib/logo";
import { normalize } from "@/lib/normalize";
import {
  getPlace,
  movedTarget,
  type Pickup,
  type PickupDay,
  type PlaceView,
} from "@/lib/schedule";
import {
  DISCLAIMER,
  hasUpcoming,
  putOutNote,
  UNVERIFIED_NOTE,
} from "@/lib/schedule-notes";
import { placePath } from "@/lib/search";
import { SITE_NAME } from "@/lib/share";
import { FRACTIONS, TOKEN, tones } from "@/lib/waste-bin";

export const runtime = "nodejs";

// Printed QR codes and links point at the permanent address (SITE_URL),
// never at a preview deployment.

// Bundled through outputFileTracingIncludes in next.config.ts.
const FONT_DIR = path.join(process.cwd(), "assets/fonts");
const REGULAR = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Regular.ttf"),
);
const BOLD = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Bold.ttf"),
);

// A4 portrait in points, 10 mm margins. The calendar pages follow the site:
// the black header band with the "ul." plate, GOV.UK Warning text, GOV.UK
// tables (three months per row) and the site's type scale. The last pages
// are a text-only version, for black-and-white and colour-blind use.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;
const COLUMNS = 3;
const COLUMN_GAP = 20;
const TABLE_W = (CONTENT_W - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;

/** The site's type scale at its physical size: CSS px × 0.75 = pt. */
const px = (n: number) => n * 0.75;

// Atkinson Hyperlegible Next's vertical metrics, in em. PDFKit sets a line
// from the top of its ascender (0.984), so the baseline is ASCENT below y and
// the cap height (0.668) starts CAP_TOP below it. Spacing is measured to the
// ink: inkOf() gives a text's own glyphs.
const ASCENT = 0.984;
const LINE = ASCENT + 0.316;
const CAP = 0.668;
const CAP_TOP = ASCENT - CAP;

// GOV.UK Frontend's palette, as on the site.
const BLACK = "#0b0c0c";
const WHITE = "#ffffff";
const SECONDARY_TEXT = "#484949";
const BORDER = "#cecece";
const PANEL = "#f3f3f3";
// govuk-colour("red") in govuk-frontend 6.5.1, also its error colour.
const RED = "#ca3535";
// Darker than the site's --waste-plastik-metale-border: small marks on paper
// need a stronger outline (app/tokens.css --waste-plastik-metale-print).
const PLASTIK_METALE_PRINT = "#5c4800";

// ---------------------------------------------------------------- marks

// One shape per fraction, so the calendar reads in black-and-white print and
// for colour-blind readers; the colour is the real bin colour (app/tokens.css)
// on top. Rare fractions are a letter in an outlined square. The website
// keeps its bin icons.
type Mark = {
  shape: "circle" | "ring" | "square" | "triangle" | "diamond" | "star";
  fill: string;
  stroke?: string;
};
const MARKS: Record<string, Mark | string> = {
  zmieszane: { shape: "circle", fill: "#111111" },
  popiol: { shape: "ring", fill: "#5c6370" },
  bio: { shape: "square", fill: "#7a4b2a" },
  papier: { shape: "triangle", fill: "#1f63c7" },
  "plastik-metale": {
    shape: "diamond",
    fill: "#f2c200",
    stroke: PLASTIK_METALE_PRINT,
  },
  szklo: { shape: "star", fill: "#1e7f4f" },
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
    doc
      .font("bold")
      .fontSize(s * 0.8)
      .fillColor(BLACK);
    const tw = doc.widthOfString(mark);
    doc.text(mark, cx - tw / 2, cy - s * 0.45, { lineBreak: false });
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
        [cx, cy - r * 1.05],
        [cx + r * 1.05, cy + r * 0.85],
        [cx - r * 1.05, cy + r * 0.85],
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
 * The plate and wordmark on dark, as in the site header: a white plate, the
 * "ul." and rim cut out to the black, and the wordmark's x-height centred on
 * the plate.
 */
function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, h: number) {
  doc
    .save()
    .translate(x, y)
    .scale(h / LOGO_HEIGHT);
  doc.path(PLATE).fillColor(WHITE).fill();
  doc.path(UL).fillColor(BLACK).fill();
  doc.path(RIM).lineWidth(RIM_WIDTH).strokeColor(BLACK).stroke();
  doc.translate(0, HEADER_WORDMARK_SHIFT);
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

type InkFont = {
  _font: {
    font: {
      unitsPerEm: number;
      layout(text: string): {
        glyphs: Array<{ bbox: { minY: number; maxY: number } }>;
      };
    };
  };
};

// A document of its own, only for measuring: reading glyphs through the
// PDF's own fonts would disturb their text layer (pdftotext lost characters).
const measurer = new PDFDocument({ autoFirstPage: false });
measurer.registerFont("regular", REGULAR);
measurer.registerFont("bold", BOLD);

/**
 * How far a text's ink reaches above and below its baseline, in pt, from its
 * glyphs' boxes. PDFKit keeps an embedded font's fontkit font as _font.font.
 * For a wrapped paragraph it covers every line.
 */
function inkOf(
  font: string,
  size: number,
  text: string,
): { above: number; below: number } {
  measurer.font(font);
  const { font: face } = (measurer as unknown as InkFont)._font;
  const boxes = face.layout(text).glyphs.map((glyph) => glyph.bbox);
  const scale = size / face.unitsPerEm;
  return {
    above: Math.max(0, ...boxes.map((box) => box.maxY)) * scale,
    below: -Math.min(0, ...boxes.map((box) => box.minY)) * scale,
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

const LATER =
  "terminy dodamy, gdy gmina je ogłosi. Aktualne zawsze na conaulicy.pl.";

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
  // Only months with dates are printed; the empty ones after the last date
  // become one line.
  const printed = months.filter((key) => byMonth.has(key));
  const lastPrinted = months.indexOf(printed[printed.length - 1]);
  const trailing = months.slice(lastPrinted + 1);
  const usual = usualWeekday(inWindow);
  const odd = (day: PickupDay) =>
    usual !== null && weekdayName(day.date) !== usual;
  const hasMoved = inWindow.some((day) => moved(day));
  const hasOdd = inWindow.some((day) => !moved(day) && odd(day));
  const putOutBy = inWindow
    .flatMap((day) => day.pickups)
    .find((p) => p.putOutBy)?.putOutBy;
  const putOut = putOutBy ? putOutNote(putOutBy) : null;
  const title = withHouseNumber(place.name, place.nr);
  const dayLine = usual ? `Twój dzień odbioru: ${usual}` : null;
  // The unverified note ends with the same advice, so then it is said once,
  // after the reason for it.
  const warningText = place.verified
    ? "Terminy mogą się zmienić. Gdyby coś się nie zgadzało, rację ma harmonogram gminy."
    : "Terminy mogą się zmienić.";

  const doc = new PDFDocument({
    size: "A4",
    // The layout keeps its own margins; a small bottom margin stops PDFKit
    // from adding a page when the footer ends right at the edge.
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 4 },
    pdfVersion: "1.7",
    // Tagged, but no PDF/UA claim (subset) until it passes veraPDF.
    tagged: true,
    lang: "pl-PL",
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
  // Content repeated on later pages (bands, key, footer) is tagged once and
  // drawn as an artifact elsewhere.
  const tag = (
    parent: PDFKit.PDFStructureElement | null,
    type: string,
    draw: () => void,
    options: { actual?: string } = {},
  ) => {
    if (parent) parent.add(doc.struct(type, options, draw));
    else draw();
  };

  // ------------------------------------------------------------ footer
  const footerLines = place.sources.map((source) => {
    const checked = source.checkedAt
      ? ` · Stan na ${longDate(source.checkedAt)}`
      : "";
    return { text: `Źródło: ${source.label}${checked}`, url: source.url };
  });
  const closing = DISCLAIMER;
  const small = px(16);
  // A URL never breaks: its own line, smaller if it must.
  const urlSize = (text: string) =>
    fitSize(doc, "regular", text, CONTENT_W, small, 6);
  // One leading for every footer line, wrapped ones and the URL too.
  const footerGap = 2;
  const footerLead = small * LINE + footerGap;
  let footerH = 0;
  for (const line of footerLines) {
    doc.font("regular").fontSize(small);
    footerH += doc.heightOfString(line.text, {
      width: CONTENT_W,
      lineGap: footerGap,
    });
    if (line.url) footerH += footerLead;
  }
  doc.font("bold").fontSize(small);
  footerH += doc.heightOfString(closing, {
    width: CONTENT_W,
    lineGap: footerGap,
  });
  // The closing line's ink ends MARGIN above the page's edge.
  const footerTop =
    PAGE_H -
    MARGIN -
    inkOf("bold", small, closing).below -
    (footerH - footerGap - small * (LINE - ASCENT));
  // The divider: ruleGap of space on both sides, to the ink.
  const ruleW = 0.75;
  const ruleGap = 8;
  const footerInkTop = footerLines.length
    ? footerTop +
      small * ASCENT -
      inkOf("regular", small, footerLines[0].text).above
    : footerTop + small * ASCENT - inkOf("bold", small, closing).above;
  const ruleY = footerInkTop - ruleGap - ruleW / 2;

  const drawFooter = (parent: PDFKit.PDFStructureElement | null) => {
    const rule = () => {
      doc
        .moveTo(MARGIN, ruleY)
        .lineTo(PAGE_W - MARGIN, ruleY)
        .lineWidth(ruleW)
        .strokeColor(BORDER)
        .stroke();
    };
    if (parent) artifact(doc, rule);
    else rule();
    let fy = footerTop;
    for (const line of footerLines) {
      const top = fy;
      doc.font("regular").fontSize(small);
      fy += doc.heightOfString(line.text, {
        width: CONTENT_W,
        lineGap: footerGap,
      });
      // A smaller URL keeps the line's baseline.
      const url = line.url;
      const size = url ? urlSize(url) : small;
      const urlTop = fy + (small - size) * ASCENT;
      tag(parent, "P", () => {
        doc
          .font("regular")
          .fontSize(small)
          .fillColor(SECONDARY_TEXT)
          .text(line.text, MARGIN, top, {
            width: CONTENT_W,
            lineGap: footerGap,
          });
        if (url) {
          doc
            .fontSize(size)
            .text(url, MARGIN, urlTop, { link: url, lineBreak: false });
        }
      });
      if (url) fy += footerLead;
    }
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
  };
  const footerArtifact = () => artifact(doc, () => drawFooter(null));

  // ------------------------------------------------------------ key
  // Only what this PDF shows: its fractions, then the date markings.
  const keyMark = 13;
  const keySize = px(19);
  const keyLine = keySize * 1.9;
  const keyTones: Array<{ tone: string; label: string }> = [];
  for (const pickup of inWindow.flatMap((day) => day.pickups)) {
    for (const tone of tones(pickup.subtype)) {
      if (keyTones.some((k) => k.tone === tone)) continue;
      keyTones.push({
        tone,
        label:
          pickup.subtype === tone
            ? pickup.label
            : (TONE_LABEL[tone] ?? pickup.label),
      });
    }
  }
  keyTones.sort(
    (a, b) => KEY_ORDER.indexOf(a.tone) - KEY_ORDER.indexOf(b.tone),
  );
  type KeyItem = { label: string; draw: (x: number, cy: number) => void };
  // As wide as a mark, so every label is as far from its swatch.
  const cell = (colour: string) => (x: number, cy: number) => {
    doc
      .rect(x, cy - keyMark * 0.75, keyMark, keyMark * 1.5)
      .fillColor(colour)
      .fill();
  };
  const keyItems: KeyItem[] = [
    ...keyTones.map(({ tone, label }) => ({
      label,
      draw: (x: number, cy: number) =>
        drawMark(doc, tone, x + keyMark / 2, cy, keyMark),
    })),
    ...(hasOdd ? [{ label: `Inny dzień niż ${usual}`, draw: cell(RED) }] : []),
    ...(hasMoved ? [{ label: "Termin przesunięty", draw: cell(RED) }] : []),
  ];
  doc.font("bold").fontSize(keySize + 1);
  const keyStart = MARGIN + doc.widthOfString("Oznaczenia") + 14;
  let kx = keyStart;
  let keyRow = 0;
  const keyPlaced = keyItems.map((item) => {
    doc.font("regular").fontSize(keySize);
    const w = keyMark + 5 + doc.widthOfString(item.label);
    if (kx > keyStart && kx + w > PAGE_W - MARGIN) {
      kx = keyStart;
      keyRow++;
    }
    const placed = { ...item, x: kx, row: keyRow };
    kx += w + 16;
    return placed;
  });
  const keyNoteH = small * 1.6;
  const keyH = (keyRow + 1) * keyLine + keyNoteH;
  const keyNote = (page: number) =>
    `Wersja tekstowa (bez kolorów i znaków) na stronie ${page}.`;
  // The note's ink ends ruleGap above the divider (a page number has no
  // descender, so any page gives the same ink).
  const keyNoteTop =
    ruleY -
    ruleW / 2 -
    ruleGap -
    inkOf("bold", small, keyNote(0)).below -
    small * ASCENT;
  const keyTop = keyNoteTop - (keyH - keyNoteH + 4);

  const drawKey = (
    parent: PDFKit.PDFStructureElement | null,
    textPage: number,
  ) => {
    tag(parent, "H2", () => {
      doc
        .font("bold")
        .fontSize(keySize + 1)
        .fillColor(BLACK)
        .text("Oznaczenia", MARGIN, keyTop, { lineBreak: false });
    });
    const list = parent ? doc.struct("L") : null;
    if (parent && list) parent.add(list);
    for (const item of keyPlaced) {
      const top = keyTop + item.row * keyLine;
      const mark = () => item.draw(item.x, top + keySize * 0.62);
      if (parent) artifact(doc, mark);
      else mark();
      tag(list, "LI", () => {
        doc
          .font("regular")
          .fontSize(keySize)
          .fillColor(BLACK)
          .text(item.label, item.x + keyMark + 5, top, { lineBreak: false });
      });
    }
    list?.end();
    tag(parent, "P", () => {
      doc
        .font("bold")
        .fontSize(small)
        .fillColor(BLACK)
        .text(keyNote(textPage), MARGIN, keyNoteTop, { width: CONTENT_W });
    });
  };

  // ------------------------------------------------------------ bands
  // Both bands pad their content by MARGIN on all four sides, measured to the
  // ink, and draw the plate at the same size.
  const logoH = 24;
  const logoGap = 14;
  const kicker = `${place.area} · Harmonogram odbioru odpadów`;
  const qrSize = 92;
  const qrX = PAGE_W - MARGIN - qrSize - 6;
  const bandTextW = qrX - 6 - 24 - MARGIN;
  const kickerTop = MARGIN + logoH + logoGap;
  const titleTop = kickerTop + 20;
  const titleSize = fitSize(doc, "bold", title, bandTextW, px(36), px(24));
  doc.font("bold").fontSize(titleSize);
  const titleH = doc.heightOfString(title, { width: bandTextW });
  const qrBottom = MARGIN + qrSize + 12;
  const scan = "Zeskanuj: aktualne terminy";
  // The usual day and the caption share one baseline: the lower of their
  // own (the day 6 below the title, the caption's cap height 8 below the QR
  // code). The band ends MARGIN below the lower ink.
  const baseline = Math.max(
    qrBottom + 8 + small * CAP,
    dayLine ? titleTop + titleH + 6 + px(19) * ASCENT : 0,
  );
  const baseInk = Math.max(
    inkOf("regular", small, scan).below,
    dayLine ? inkOf("bold", px(19), dayLine).below : 0,
  );
  const titleInk =
    titleTop +
    titleH -
    titleSize * (LINE - ASCENT) +
    inkOf("bold", titleSize, title).below;
  const bandH = Math.max(baseline + baseInk, dayLine ? 0 : titleInk) + MARGIN;
  const bandBaseline = bandH - MARGIN - baseInk;

  /** Page 1: black band, plate, place, usual day and the QR code. */
  const drawBand = () => {
    artifact(doc, () => {
      doc.rect(0, 0, PAGE_W, bandH).fillColor(BLACK).fill();
      drawLogo(doc, MARGIN, MARGIN, logoH);
      doc
        .rect(qrX - 6, MARGIN, qrSize + 12, qrSize + 12)
        .fillColor(WHITE)
        .fill();
      drawQr(doc, url, qrX, MARGIN + 6, qrSize);
    });
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(fitSize(doc, "regular", kicker, bandTextW, px(19), 9))
        .fillColor(WHITE)
        .text(kicker, MARGIN, kickerTop, { lineBreak: false });
    });
    tag(root, "H1", () => {
      doc
        .font("bold")
        .fontSize(titleSize)
        .fillColor(WHITE)
        .text(title, MARGIN, titleTop, { width: bandTextW });
    });
    if (dayLine) {
      tag(root, "P", () => {
        doc
          .font("bold")
          .fontSize(px(19))
          .fillColor(WHITE)
          .text(dayLine, MARGIN, bandBaseline - px(19) * ASCENT, {
            lineBreak: false,
          });
      });
    }
    // On the shared baseline, under the QR code.
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(small)
        .fillColor(WHITE)
        .text(scan, PAGE_W - MARGIN - 170, bandBaseline - small * ASCENT, {
          width: 170,
          align: "right",
          lineBreak: false,
          link: url,
        });
    });
    return bandH;
  };

  /** Later pages: a compact black band with the plate and the place. */
  const compactH =
    MARGIN +
    logoH +
    logoGap +
    px(19) * ASCENT +
    inkOf("bold", px(19), `${title} · wersja tekstowa`).below +
    MARGIN;
  const compactBand = (
    what: string,
    parent: PDFKit.PDFStructureElement | null,
  ) => {
    const text = `${title} · ${what}`;
    const plate = () => {
      doc.rect(0, 0, PAGE_W, compactH).fillColor(BLACK).fill();
      drawLogo(doc, MARGIN, MARGIN, logoH);
    };
    // On the bottom padding, also when a long name sets it smaller.
    const size = fitSize(doc, "bold", text, CONTENT_W, px(19), 9);
    const words = () => {
      doc
        .font("bold")
        .fontSize(size)
        .fillColor(WHITE)
        .text(
          text,
          MARGIN,
          compactH - MARGIN - inkOf("bold", size, text).below - size * ASCENT,
          { lineBreak: false },
        );
    };
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

  // ------------------------------------------------------------ panel
  // GOV.UK Warning text on the grey band, then any other notes: that no one
  // has checked the dates yet (as on the page), the put-out time, and the
  // line about months not announced yet when it does not fit below the
  // calendar.
  type Note = { bold: string; text: string };
  const warnD = px(35);
  const noteX = MARGIN + warnD + px(15);
  const noteW = CONTENT_W - warnD - px(15);
  const later: Note | null = trailing.length
    ? { bold: `${emptyRange(trailing)}: `, text: LATER }
    : null;
  const panelNotes = (withLater: boolean): Note[] => [
    ...(place.verified ? [] : [{ bold: "", text: UNVERIFIED_NOTE }]),
    ...(putOut ? [{ bold: "", text: putOut }] : []),
    ...(withLater && later ? [later] : []),
  ];
  const noteH = (note: Note, width: number) => {
    doc.font("regular").fontSize(px(19));
    return doc.heightOfString(note.bold + note.text, { width });
  };
  const warnH = () => {
    doc.font("bold").fontSize(px(19));
    return Math.max(warnD, doc.heightOfString(warningText, { width: noteW }));
  };
  // 12 above the circle and 12 below the last ink: the last note's
  // descenders, or the warning's or the circle's without notes.
  const panelH = (notes: Note[]) => {
    const below = (font: string, text: string) =>
      px(19) * (LINE - ASCENT) - inkOf(font, px(19), text).below;
    const last = notes[notes.length - 1];
    if (last) {
      const end =
        12 + warnH() + notes.reduce((sum, n) => sum + 8 + noteH(n, noteW), 0);
      return end - below("regular", last.bold + last.text) + 12;
    }
    doc.font("bold").fontSize(px(19));
    const text = 15 + doc.heightOfString(warningText, { width: noteW });
    return Math.max(12 + warnD, text - below("bold", warningText)) + 12;
  };

  const drawNote = (note: Note, x: number, top: number, width: number) => {
    tag(root, "P", () => {
      doc
        .font("bold")
        .fontSize(px(19))
        .fillColor(BLACK)
        .text(note.bold, x, top, { width, continued: true })
        .font("regular")
        .text(note.text);
    });
  };

  const drawPanel = (top: number, notes: Note[]) => {
    const h = panelH(notes);
    artifact(doc, () => {
      doc.rect(0, top, PAGE_W, h).fillColor(PANEL).fill();
      doc
        .circle(MARGIN + warnD / 2, top + 12 + warnD / 2, warnD / 2)
        .fillColor(BLACK)
        .fill();
      doc
        .font("bold")
        .fontSize(warnD * 0.72)
        .fillColor(WHITE);
      // Centred by its ink: the "!" is symmetric in its advance, and runs
      // from the cap height to 0.012 em below the baseline (0.68 em).
      const tw = doc.widthOfString("!");
      const bangTop = warnD / 2 - warnD * 0.72 * (CAP_TOP + 0.68 / 2);
      doc.text("!", MARGIN + warnD / 2 - tw / 2, top + 12 + bangTop, {
        lineBreak: false,
      });
    });
    // GOV.UK's visually hidden "Warning" prefix, for screen readers.
    tag(
      root,
      "P",
      () => {
        doc
          .font("bold")
          .fontSize(px(19))
          .fillColor(BLACK)
          .text(warningText, noteX, top + 15, { width: noteW });
      },
      { actual: `Ostrzeżenie: ${warningText}` },
    );
    let y = top + 12 + warnH();
    for (const note of notes) {
      drawNote(note, noteX, y + 8, noteW);
      y += 8 + noteH(note, noteW);
    }
    return top + h;
  };

  // ------------------------------------------------------------ grid
  const caption = px(24);
  const cellText = px(19);
  const rowH = 25;
  const dateW = 56;
  const mark = 12.5;
  const markGap = 6;
  // Dates and "Dzień" start this far in: the red cell's even inner padding.
  const inset = 3;
  // A date's digits centred in their row by their ink, as the marks are.
  const dateTop = (rowTop: number, n: string) => {
    const ink = inkOf("bold", cellText, n);
    return rowTop + rowH / 2 + (ink.above - ink.below) / 2 - cellText * ASCENT;
  };
  const perLine = Math.floor((TABLE_W - dateW - 8) / (mark + markGap));
  const lines = (day: PickupDay) =>
    Math.max(
      1,
      Math.ceil(day.pickups.flatMap((p) => tones(p.subtype)).length / perLine),
    );
  // Tables in a row share the height of the row's tallest month.
  const slots = (keys: string[]) =>
    Math.max(
      1,
      ...keys.map((key) =>
        (byMonth.get(key) ?? []).reduce((sum, day) => sum + lines(day), 0),
      ),
    );
  const tableH = (keys: string[]) => caption * 1.45 + rowH * (slots(keys) + 1);
  const yearH = px(24) * 1.6;

  const drawMonth = (
    key: string,
    rowYear: string,
    x: number,
    y: number,
    rowSlots: number,
  ) => {
    const days = byMonth.get(key) ?? [];
    // A year that starts inside a row is named in its first month's caption.
    const name =
      key.slice(0, 4) === rowYear ? monthName(key) : monthTitle(`${key}-01`);
    tag(root, "H3", () => {
      doc
        .font("bold")
        .fontSize(caption)
        .fillColor(BLACK)
        .text(name, x, y, { lineBreak: false });
    });
    const head = y + caption * 1.45;
    const table = doc.struct("Table");
    root.add(table);
    const headRow = doc.struct("TR");
    table.add(headRow);
    const headY = head + (rowH - cellText) / 2 - 1;
    headRow.add(
      doc.struct("TH", {}, () => {
        doc
          .font("bold")
          .fontSize(cellText)
          .fillColor(BLACK)
          .text("Dzień", x + inset, headY, { lineBreak: false });
      }),
    );
    headRow.add(
      doc.struct("TH", {}, () => {
        doc.text("Odpady", x + dateW + 4, headY, { lineBreak: false });
      }),
    );
    artifact(doc, () => {
      doc
        .moveTo(x, head + rowH)
        .lineTo(x + TABLE_W, head + rowH)
        .lineWidth(1)
        .strokeColor(BLACK)
        .stroke();
    });
    let rowTop = head + rowH;
    for (const day of days) {
      const h = lines(day) * rowH;
      const from = moved(day);
      const marked = from || odd(day);
      const n = String(Number(day.date.slice(8)));
      const text = usual && !marked ? n : `${n} ${weekdayShort(day.date)}`;
      const top = rowTop;
      // The red hugs its text, so the marks keep their usual distance.
      const textW = doc.font("bold").fontSize(cellText).widthOfString(text);
      artifact(doc, () => {
        if (marked) {
          doc
            .rect(x, top + 2, textW + 2 * inset, rowH - 4)
            .fillColor(RED)
            .fill();
        }
        doc
          .moveTo(x, top + h)
          .lineTo(x + TABLE_W, top + h)
          .lineWidth(0.75)
          .strokeColor(BORDER)
          .stroke();
      });
      const tr = doc.struct("TR");
      table.add(tr);
      tr.add(
        doc.struct("TD", { actual: spoken(day) }, () => {
          doc
            .font("bold")
            .fontSize(cellText)
            .fillColor(marked ? WHITE : BLACK)
            .text(text, x + inset, dateTop(top, n), {
              lineBreak: false,
            });
        }),
      );
      const marks = day.pickups.flatMap((p) => tones(p.subtype));
      tr.add(
        doc.struct("TD", { actual: label(day.pickups) }, () => {
          marks.forEach((tone, i) => {
            const line = Math.floor(i / perLine);
            const col = i % perLine;
            drawMark(
              doc,
              tone,
              x + dateW + 4 + mark / 2 + col * (mark + markGap),
              top + line * rowH + rowH / 2,
              mark,
            );
          });
        }),
      );
      rowTop += h;
    }
    table.end();
    return head + rowH * (rowSlots + 1);
  };

  // ------------------------------------------------------------ calendar
  const rows: string[][] = [];
  for (let i = 0; i < printed.length; i += COLUMNS) {
    rows.push(printed.slice(i, i + COLUMNS));
  }
  // Lay out first: the key names the page where the text version starts,
  // and the "not announced yet" line goes below the calendar only if it fits.
  // Below the compact band on later calendar pages.
  const CONTINUED_TOP = compactH + 22;
  const layout = (laterInPanel: boolean) => {
    const breaks: number[] = [];
    let y = bandH + panelH(panelNotes(laterInPanel)) + 18;
    let year = "";
    rows.forEach((row, i) => {
      const need = tableH(row) + yearH;
      if (y + need > keyTop - 12 && i > 0) {
        breaks.push(i);
        y = CONTINUED_TOP;
        year = "";
      }
      if (row[0].slice(0, 4) !== year) {
        year = row[0].slice(0, 4);
        y += yearH;
      }
      y += tableH(row) + 16;
    });
    const laterFits =
      !later || laterInPanel || y + noteH(later, CONTENT_W) <= keyTop - 8;
    return { breaks, laterFits };
  };
  let laterInPanel = false;
  let plan = layout(false);
  if (!plan.laterFits) {
    laterInPanel = true;
    plan = layout(true);
  }
  const pageBreaks = plan.breaks;
  const textPage = pageBreaks.length + 2;

  let y = drawPanel(drawBand(), panelNotes(laterInPanel)) + 18;
  let year = "";
  let page = 1;
  const yearsTagged = new Set<string>();
  rows.forEach((row, i) => {
    if (pageBreaks.includes(i)) {
      if (page === 1) drawKey(root, textPage);
      else artifact(doc, () => drawKey(null, textPage));
      footerArtifact();
      doc.addPage();
      page++;
      compactBand("ciąg dalszy", null);
      y = CONTINUED_TOP;
      year = "";
    }
    // The year above each page's first row and wherever a new year starts.
    // A year is tagged (H2) once; repeated, it is decoration.
    const rowYear = row[0].slice(0, 4);
    if (rowYear !== year) {
      year = rowYear;
      const top = y;
      const heading = () => {
        doc
          .font("bold")
          .fontSize(px(24))
          .fillColor(BLACK)
          .text(rowYear, MARGIN, top, { lineBreak: false });
      };
      if (yearsTagged.has(rowYear)) artifact(doc, heading);
      else {
        yearsTagged.add(rowYear);
        tag(root, "H2", heading);
      }
      y += yearH;
    }
    const rowSlots = slots(row);
    row.forEach((key, column) => {
      drawMonth(
        key,
        rowYear,
        MARGIN + column * (TABLE_W + COLUMN_GAP),
        y,
        rowSlots,
      );
    });
    y += tableH(row) + 16;
  });
  if (later && !laterInPanel) drawNote(later, MARGIN, y, CONTENT_W);
  if (page === 1) drawKey(root, textPage);
  else artifact(doc, () => drawKey(null, textPage));
  footerArtifact();

  // ------------------------------------------------------------ text version
  // No colours and no marks: the same dates as a list.
  doc.addPage();
  y = compactBand("wersja tekstowa", root) + 18;
  const textBottom = footerTop - 14;
  // One leading for the page's 19px text: paragraphs, list items and their
  // wrapped lines alike.
  const bodyGap = 2;
  const intro = [
    ...(dayLine ? [`${dayLine}.`] : []),
    "Te same terminy co w kalendarzu, w formie listy.",
    ...(putOut ? [putOut] : []),
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

  const ensure = (height: number) => {
    if (y + height <= textBottom) return;
    footerArtifact();
    doc.addPage();
    y = compactBand("wersja tekstowa, ciąg dalszy", null) + 18;
  };
  // GOV.UK's scale, as on the site: month headings heading-m, the rest body.
  const listSize = px(19);
  const headSize = px(24);

  // Chronological: months with dates in full, gaps collapsed into one line.
  let gap: string[] = [];
  const flushGap = (last: boolean) => {
    if (gap.length === 0) return;
    const range = `${emptyRange(gap)}: `;
    const text = last ? LATER : "terminy jeszcze nieogłoszone.";
    gap = [];
    ensure(listSize * 2);
    const top = y;
    tag(root, "P", () => {
      doc
        .font("bold")
        .fontSize(listSize)
        .fillColor(BLACK)
        .text(range, MARGIN, top, {
          width: CONTENT_W,
          lineGap: bodyGap,
          continued: true,
        })
        .font("regular")
        .text(text);
    });
    y = doc.y + 8 - bodyGap;
  };
  // Months before the first date (e.g. the rest of this month, with no
  // pickups left) are simply skipped.
  for (const key of months.slice(months.indexOf(printed[0]))) {
    const days = byMonth.get(key);
    if (!days) {
      gap.push(key);
      continue;
    }
    flushGap(false);
    ensure(headSize * 1.5 + (listSize * 1.2 + 1) * Math.min(days.length, 2));
    const section = doc.struct("Sect");
    root.add(section);
    const headTop = y;
    tag(section, "H2", () => {
      doc
        .font("bold")
        .fontSize(headSize)
        .fillColor(BLACK)
        .text(monthTitle(`${key}-01`), MARGIN, headTop, { width: CONTENT_W });
    });
    y = doc.y + 3;
    const list = doc.struct("L");
    section.add(list);
    for (const day of days) {
      const text = `${spoken(day)} – ${label(day.pickups)}`;
      doc.font("regular").fontSize(listSize);
      const h = doc.heightOfString(text, {
        width: CONTENT_W - 12,
        lineGap: bodyGap,
      });
      ensure(h);
      const top = y;
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
      y = doc.y;
    }
    list.end();
    section.end();
    y += 6;
  }
  flushGap(true);
  drawFooter(root);

  root.end();
  doc.end();
  return done;
}

function slug(text: string): string {
  return normalize(text).replaceAll(" ", "-");
}

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
        ...datasetHeaders("public, s-maxage=3600"),
      },
    });
  }
  if (!place || !hasUpcoming(place.days, place.today)) {
    return new Response("Nie mamy harmonogramu dla tego adresu.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...datasetHeaders("public, s-maxage=3600"),
        ...NOINDEX,
      },
    });
  }

  const pdf = await render(
    place,
    `${SITE_URL}${placePath(place.id, place.nr)}`,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // With a house number: in the file name too.
      "Content-Disposition": `inline; filename="harmonogram-${slug(withHouseNumber(place.label, place.nr))}.pdf"`,
      ...datasetHeaders(),
      ...NOINDEX,
    },
  });
}
