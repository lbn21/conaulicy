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
import { type Block, flow, pack, type Spot } from "@/lib/pdf-flow";
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
import { type GuideSource, guideFor } from "@/lib/sorting-guide";
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

// A4 portrait in points, 10 mm margins, laid out as a council's bin leaflet
// in the site's look: page 1 the whole published period on one page (the
// cherry band with the "ul." plate and QR code, GOV.UK Warning text and the
// notes with their icons, a grid of small month tables, four a row, each
// date with its fractions' marks, the key); then „Co wrzucać”, a tile per
// fraction from the gmina's own rules (lib/sorting-guide.ts) with Lucide's
// icons, the hazardous-waste strip and the rules' sources; then a text-only
// version, for black-and-white and colour-blind use.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;
const COLUMNS = 4;
const COLUMN_GAP = 12;
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

// GOV.UK Frontend's palette, as on the site (lib/govuk-colours.ts).
const BLACK = GOVUK_FUNCTIONAL.text;
const WHITE = GOVUK_COLOUR.white;
const SECONDARY_TEXT = GOVUK_FUNCTIONAL["secondary-text"];
const BORDER = GOVUK_FUNCTIONAL.border;
const PANEL = GOVUK_COLOUR["black-tint-95"];
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
  // Only months with dates are printed.
  const printed = months.filter((key) => byMonth.has(key));
  // After the last date, as on the page and in the calendar.
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
  // The unverified note ends with the same advice, so then it is said once,
  // after the reason for it.
  const warningText = place.verified
    ? `Terminy mogą się zmienić. Jeśli coś się nie zgadza, ważniejszy jest ${scheduleName(place.gmina)}.`
    : "Terminy mogą się zmienić.";
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
  /** The top for a line of text whose cap height is centred in a box. */
  const capCentred = (size: number, top: number, height: number) =>
    top + height / 2 + (size * CAP) / 2 - size * ASCENT;

  // ------------------------------------------------------------ footers
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
  const mainFooter = footer(
    sourceLines(place.sources),
    disclaimer(place.gmina),
  );
  const ruleY = mainFooter.ruleY;

  /**
   * The guide's sources, compact: the day they were checked once (or on
   * each line if they differ), then one line per source, its name and link,
   * smaller if it must (never under 7 pt), on one leading.
   */
  const sourcesFooter = (sources: GuideSource[]) => {
    const days = [...new Set(sources.map((source) => source.checkedAt))];
    const one = days.length === 1;
    const head = one
      ? `Zasady segregacji według gminy · stan na ${longDate(days[0])}:`
      : "Zasady segregacji według gminy:";
    const lines = sources.map((source) => ({
      text: `${source.label}${one ? "" : ` (stan na ${longDate(source.checkedAt)})`}: ${source.url}`,
      url: source.url,
    }));
    const sizeOf = (text: string) =>
      fitSize(doc, "regular", text, CONTENT_W, small, 7);
    const last = lines.at(-1);
    const lastBelow = last
      ? inkOf("regular", sizeOf(last.text), last.text).below
      : inkOf("bold", small, head).below;
    // Every line on the same leading; a smaller one keeps its baseline.
    const lastBaseline = PAGE_H - MARGIN - lastBelow;
    const top = lastBaseline - lines.length * footerLead - small * ASCENT;
    const ruleY =
      top +
      small * ASCENT -
      inkOf("bold", small, head).above -
      ruleGap -
      ruleW / 2;
    const draw = (parent: PDFKit.PDFStructureElement | null) => {
      divider(parent, ruleY);
      tag(parent, "P", () => {
        doc
          .font("bold")
          .fontSize(small)
          .fillColor(BLACK)
          .text(head, MARGIN, top, { lineBreak: false });
      });
      lines.forEach((line, i) => {
        const size = sizeOf(line.text);
        const baselineY = top + small * ASCENT + (i + 1) * footerLead;
        tag(parent, "P", () => {
          doc
            .font("regular")
            .fontSize(size)
            .fillColor(SECONDARY_TEXT)
            .text(line.text, MARGIN, baselineY - size * ASCENT, {
              lineBreak: false,
              link: line.url,
            });
        });
      });
    };
    return { ruleY, draw, artifact: () => artifact(doc, () => draw(null)) };
  };

  // ------------------------------------------------------------ bands
  // Both bands pad their content by MARGIN on all four sides, measured to the
  // ink, and draw the plate at the same size.
  const logoH = 24;
  const logoGap = 12;
  const kicker = `${place.area} · Harmonogram odbioru odpadów`;
  const qrSize = 76;
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

  /** Page 1: the band, plate, place, usual day and the QR code. */
  const drawBand = () => {
    artifact(doc, () => {
      doc.rect(0, 0, PAGE_W, bandH).fillColor(HEADER).fill();
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
    const scanWidth = 170;
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(small)
        .fillColor(WHITE)
        .text(
          scan,
          PAGE_W - MARGIN - scanWidth,
          bandBaseline - small * ASCENT,
          {
            width: scanWidth,
            align: "right",
            lineBreak: false,
            link: url,
          },
        );
    });
    return bandH;
  };

  /** Later pages: a compact band with the plate and the place. */
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
      doc.rect(0, 0, PAGE_W, compactH).fillColor(HEADER).fill();
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

  // ------------------------------------------------------------ guide
  // Page 2, „Co wrzucać”: a tile per fraction in two columns, as large as
  // fits one page (from the site's 16px down to 8 pt), the hazardous-waste
  // strip and the guide's sources below. Laid out first, so page 1 can say
  // where it and the text version are.
  const TILE_GAP = 10;
  const tileW = (CONTENT_W - TILE_GAP) / 2;
  const pad = 8;
  const guideTop = compactH + 16;
  const guideFooter = guide ? sourcesFooter(guide.sources) : null;
  const ink = (fill: string) => readableInk(fill, [BLACK, WHITE]);
  type Tile = NonNullable<typeof guide>["tiles"][number];
  const tileName = (tile: Tile) => toneLabel(tile.subtype);
  // Header: the icon, the name (and the bin), the calendar's mark on white.
  const headIcon = (s: number) => s * 1.7;
  const markBox = (s: number) => s * 1.6;
  const nameSize = (s: number) => s * 1.2;
  const nameW = (s: number) =>
    tileW - 2 * pad - headIcon(s) - 6 - markBox(s) - 6;
  const bulletIndent = (s: number) => s * 0.95;
  const itemGap = 1;
  const tipIcon = (s: number) => s * 1.1;
  const headH = (tile: Tile, s: number) => {
    doc.font("bold").fontSize(nameSize(s));
    let h = doc.heightOfString(tileName(tile), { width: nameW(s) });
    if (tile.container) {
      doc.font("regular").fontSize(s);
      h += doc.heightOfString(tile.container, { width: nameW(s) });
    }
    return Math.max(h, headIcon(s), markBox(s)) + 2 * pad;
  };
  const itemsH = (items: string[], s: number) => {
    doc.font("regular").fontSize(s);
    return items.reduce(
      (sum, item) =>
        sum +
        doc.heightOfString(item, {
          width: tileW - 2 * pad - bulletIndent(s),
          lineGap: itemGap,
        }),
      0,
    );
  };
  const tipW = (s: number) => tileW - 2 * pad - tipIcon(s) - 5;
  const tipsH = (tips: string[], s: number) => {
    doc.font("regular").fontSize(s);
    return tips.reduce(
      (sum, tip) =>
        sum + doc.heightOfString(tip, { width: tipW(s), lineGap: itemGap }),
      0,
    );
  };
  const sectionGap = (s: number) => s * 0.6;
  const bodyH = (tile: Tile, s: number) => {
    const parts = [
      s * LINE + 2 + itemsH(tile.yes, s),
      ...(tile.no.length ? [s * LINE + 2 + itemsH(tile.no, s)] : []),
      ...(tile.tips.length ? [tipsH(tile.tips, s)] : []),
    ];
    return (
      2 * pad +
      parts.reduce((a, b) => a + b, 0) +
      sectionGap(s) * (parts.length - 1)
    );
  };
  const tileH = (tile: Tile, s: number) => headH(tile, s) + bodyH(tile, s);
  // The strip: a line saying where, the items, then the tips.
  const hazardIcon = (s: number) => s * 1.9;
  const hazardW = (s: number) => CONTENT_W - 2 * pad - hazardIcon(s) - 8;
  const hazardLines = (s: number) => {
    if (!guide) return [];
    const { hazard } = guide;
    const items = hazard.items.join(", ");
    return [
      { font: "bold", text: `Odpady niebezpieczne oddaj: ${hazard.place}` },
      {
        font: "regular",
        text: `${items.charAt(0).toUpperCase()}${items.slice(1)}.`,
      },
      ...hazard.tips.map((text) => ({ font: "regular", text })),
    ].map((line) => {
      doc.font(line.font).fontSize(s);
      return {
        ...line,
        h: doc.heightOfString(line.text, {
          width: hazardW(s),
          lineGap: itemGap,
        }),
      };
    });
  };
  const hazardH = (s: number) =>
    Math.max(
      hazardIcon(s),
      hazardLines(s).reduce((sum, line) => sum + line.h, 0),
    ) +
    2 * pad;
  const guideBottom = (s: number) =>
    (guideFooter?.ruleY ?? PAGE_H) - 12 - hazardH(s) - 12;
  const guidePlan = (() => {
    if (!guide) return null;
    const layoutAt = (s: number) => {
      const heights = guide.tiles.map((tile) => tileH(tile, s));
      return {
        s,
        heights,
        slots: pack(heights, 2, TILE_GAP, guideTop, guideTop, guideBottom(s)),
      };
    };
    // The fewest pages, each at the largest size that fits them: one page
    // down to 9 pt (a leaflet's small print), more pages from the site's
    // 16px down to 10 pt, so a long guide stays easy to read.
    const pagesOf = (plan: ReturnType<typeof layoutAt>) =>
      Math.max(...plan.slots.map((slot) => slot.page)) + 1;
    for (let pages = 1; pages <= guide.tiles.length; pages++) {
      const min = pages === 1 ? 9 : 10;
      for (let s = small; s >= min; s -= 0.25) {
        const plan = layoutAt(s);
        if (pagesOf(plan) <= pages) return plan;
      }
    }
    return layoutAt(10);
  })();
  const guidePages = guidePlan
    ? Math.max(...guidePlan.slots.map((slot) => slot.page)) + 1
    : 0;

  const drawTile = (tile: Tile, x: number, y: number, s: number, h: number) => {
    const fill = WASTE[TOKEN[tile.subtype]];
    const onFill = ink(fill);
    const edge =
      [
        WASTE[`${TOKEN[tile.subtype]}-print`],
        WASTE[`${TOKEN[tile.subtype]}-border`],
      ].find((c) => c && c !== "transparent") ?? fill;
    const head = headH(tile, s);
    const section = doc.struct("Sect");
    root.add(section);
    artifact(doc, () => {
      doc.rect(x, y, tileW, head).fillColor(fill).fill();
      doc
        .rect(x + 0.5, y + 0.5, tileW - 1, h - 1)
        .lineWidth(1)
        .strokeColor(edge)
        .stroke();
      drawIcon(
        doc,
        FRACTION_ICONS[TOKEN[tile.subtype]],
        x + pad,
        y + (head - headIcon(s)) / 2,
        headIcon(s),
        onFill,
      );
      const box = markBox(s);
      const bx = x + tileW - pad - box;
      const by = y + (head - box) / 2;
      doc.rect(bx, by, box, box).fillColor(WHITE).fill();
      drawMark(doc, tile.subtype, bx + box / 2, by + box / 2, s * 0.9);
    });
    // Name and bin, centred together in the header.
    const nx = x + pad + headIcon(s) + 6;
    doc.font("bold").fontSize(nameSize(s));
    const nh = doc.heightOfString(tileName(tile), { width: nameW(s) });
    doc.font("regular").fontSize(s);
    const ch = tile.container
      ? doc.heightOfString(tile.container, { width: nameW(s) })
      : 0;
    const ny = y + (head - nh - ch) / 2;
    tag(section, "H2", () => {
      doc
        .font("bold")
        .fontSize(nameSize(s))
        .fillColor(onFill)
        .text(tileName(tile), nx, ny, { width: nameW(s) });
    });
    if (tile.container) {
      const container = tile.container;
      tag(section, "P", () => {
        doc
          .font("regular")
          .fontSize(s)
          .fillColor(onFill)
          .text(container, nx, ny + nh, { width: nameW(s) });
      });
    }
    let cy = y + head + pad;
    const list = (
      heading: string,
      icon: typeof PDF_ICONS.yes,
      colour: string,
      items: string[],
    ) => {
      const top = cy;
      const iconS = s * 1.05;
      artifact(doc, () =>
        drawIcon(
          doc,
          icon,
          x + pad,
          top + s * (ASCENT - CAP / 2) - iconS / 2,
          iconS,
          colour,
        ),
      );
      tag(section, "H3", () => {
        doc
          .font("bold")
          .fontSize(s)
          .fillColor(BLACK)
          .text(heading, x + pad + iconS + 4, top, { lineBreak: false });
      });
      cy += s * LINE + 2;
      const l = doc.struct("L");
      section.add(l);
      for (const item of items) {
        const itemTop = cy;
        artifact(doc, () => {
          doc
            .circle(
              x + pad + s * 0.35,
              itemTop + s * (ASCENT - CAP / 2),
              s * 0.13,
            )
            .fillColor(BLACK)
            .fill();
        });
        tag(l, "LI", () => {
          doc
            .font("regular")
            .fontSize(s)
            .fillColor(BLACK)
            .text(item, x + pad + bulletIndent(s), itemTop, {
              width: tileW - 2 * pad - bulletIndent(s),
              lineGap: itemGap,
            });
        });
        doc.font("regular").fontSize(s);
        cy += doc.heightOfString(item, {
          width: tileW - 2 * pad - bulletIndent(s),
          lineGap: itemGap,
        });
      }
      l.end();
    };
    list("Wrzucaj", PDF_ICONS.yes, GOVUK_FUNCTIONAL.success, tile.yes);
    if (tile.no.length) {
      cy += sectionGap(s);
      list("Nie wrzucaj", PDF_ICONS.no, GOVUK_FUNCTIONAL.error, tile.no);
    }
    if (tile.tips.length) {
      cy += sectionGap(s);
      for (const tip of tile.tips) {
        const top = cy;
        artifact(doc, () =>
          drawIcon(
            doc,
            PDF_ICONS.tip,
            x + pad,
            top + s * (ASCENT - CAP / 2) - tipIcon(s) / 2,
            tipIcon(s),
            BLACK,
          ),
        );
        tag(section, "P", () => {
          doc
            .font("regular")
            .fontSize(s)
            .fillColor(BLACK)
            .text(tip, x + pad + tipIcon(s) + 5, top, {
              width: tipW(s),
              lineGap: itemGap,
            });
        });
        doc.font("regular").fontSize(s);
        cy += doc.heightOfString(tip, { width: tipW(s), lineGap: itemGap });
      }
    }
    section.end();
  };

  const drawHazard = (s: number) => {
    const h = hazardH(s);
    const top = (guideFooter?.ruleY ?? PAGE_H) - 12 - h;
    const onRed = ink(RED);
    const section = doc.struct("Sect");
    root.add(section);
    artifact(doc, () => {
      doc.rect(MARGIN, top, CONTENT_W, h).fillColor(RED).fill();
      drawIcon(
        doc,
        PDF_ICONS.hazard,
        MARGIN + pad,
        top + (h - hazardIcon(s)) / 2,
        hazardIcon(s),
        onRed,
      );
    });
    const lines = hazardLines(s);
    const textH = lines.reduce((sum, line) => sum + line.h, 0);
    let ly = top + (h - textH) / 2;
    for (const [i, line] of lines.entries()) {
      const lineTop = ly;
      tag(section, i === 0 ? "H2" : "P", () => {
        doc
          .font(line.font)
          .fontSize(s)
          .fillColor(onRed)
          .text(line.text, MARGIN + pad + hazardIcon(s) + 8, lineTop, {
            width: hazardW(s),
            lineGap: itemGap,
          });
      });
      ly += line.h;
    }
    section.end();
  };

  const drawGuide = () => {
    if (!guide || !guidePlan || !guideFooter) return;
    const { s, heights, slots } = guidePlan;
    // Page by page: first fit may put a later tile on an earlier page.
    const order = guide.tiles
      .map((_, i) => i)
      .sort((a, b) => slots[a].page - slots[b].page);
    let page = -1;
    for (const i of order) {
      const slot = slots[i];
      while (page < slot.page) {
        if (page >= 0) guideFooter.artifact();
        doc.addPage();
        page++;
        if (page === 0) compactBand("co wrzucać do pojemników", root);
        else compactBand("co wrzucać do pojemników, ciąg dalszy", null);
      }
      drawTile(
        guide.tiles[i],
        MARGIN + slot.column * (tileW + TILE_GAP),
        slot.y,
        s,
        heights[i],
      );
    }
    drawHazard(s);
    guideFooter.draw(root);
  };

  // ------------------------------------------------------------ key
  // Each calendar page explains only what it shows: its fractions, then its
  // date markings. Labels at the footer's size, marks centred on their cap
  // height, one ruleGap from the last row's ink to the note's.
  const keyMark = 11;
  const keySize = small;
  const keyLine = 19;
  const keyLabelGap = 4;
  const keyItemGap = 12;
  type KeyItem = {
    label: string;
    draw: (x: number, cy: number) => void;
    swatch?: boolean;
  };
  // As wide as a mark, so every label is as far from its swatch.
  const cell = (label: string, colour: string): KeyItem => ({
    label,
    swatch: true,
    draw: (x, cy) => {
      doc
        .rect(x, cy - keyMark * 0.75, keyMark, keyMark * 1.5)
        .fillColor(colour)
        .fill();
    },
  });
  // Where page 2 and the text version are; one line, smaller if it must.
  const keyNoteText = (textPage: number) =>
    [
      ...(guide ? [`Co wrzucać: strona ${textPage - guidePages}`] : []),
      `Wersja tekstowa (bez kolorów i znaków): strona ${textPage}`,
    ].join(" · ");
  const keyNoteSize = (text: string) =>
    fitSize(doc, "bold", text, CONTENT_W, small, 8);
  // The note's ink ends ruleGap above the divider (a page number has no
  // descender, so any page gives the same ink).
  const keyNoteTop = (text: string) =>
    ruleY -
    ruleW / 2 -
    ruleGap -
    inkOf("bold", keyNoteSize(text), text).below -
    keyNoteSize(text) * ASCENT;
  const keyNoteInk = (text: string) =>
    keyNoteTop(text) +
    keyNoteSize(text) * ASCENT -
    inkOf("bold", keyNoteSize(text), text).above;
  // Marks and swatches are centred on the labels' cap height.
  const keyMid = keySize * (ASCENT - CAP / 2);
  // How far an item's ink reaches below its row's top: its label's
  // descenders, a swatch, or a mark (the outlined diamond reaches lowest,
  // 0.6 of its size).
  const keyInk = (item: KeyItem) =>
    Math.max(
      keySize * ASCENT + inkOf("regular", keySize, item.label).below,
      keyMid + keyMark * (item.swatch ? 0.75 : 0.6),
    );
  const keyHeading = "Oznaczenia";
  doc.font("bold").fontSize(keySize);
  const keyStart = MARGIN + doc.widthOfString(keyHeading) + keyItemGap;
  // Any page number: the note's ink is the same for all.
  const noteSample = keyNoteText(9);

  /** The key for the months on one page, laid out above the note. */
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
          drawMark(doc, tone, x + keyMark / 2, cy, keyMark),
      })),
      // Only what the data marks: a date moved from its usual day.
      ...(days.some((day) => moved(day))
        ? [cell("Termin przesunięty", RED)]
        : []),
    ];
    let kx = keyStart;
    let row = 0;
    const placed = items.map((item) => {
      doc.font("regular").fontSize(keySize);
      const w = keyMark + keyLabelGap + doc.widthOfString(item.label);
      if (kx > keyStart && kx + w > PAGE_W - MARGIN) {
        kx = keyStart;
        row++;
      }
      const at = { ...item, x: kx, row };
      kx += w + keyItemGap;
      return at;
    });
    const lastInk = Math.max(
      ...placed.filter((item) => item.row === row).map(keyInk),
    );
    const top = keyNoteInk(noteSample) - ruleGap - lastInk - row * keyLine;
    return { placed, rows: row + 1, top };
  };
  type Key = ReturnType<typeof keyFor>;

  const drawKey = (
    parent: PDFKit.PDFStructureElement | null,
    textPage: number,
    key: Key,
  ) => {
    const keyTop = key.top;
    tag(parent, "H2", () => {
      doc
        .font("bold")
        .fontSize(keySize)
        .fillColor(BLACK)
        .text(keyHeading, MARGIN, keyTop, { lineBreak: false });
    });
    const list = parent ? doc.struct("L") : null;
    if (parent && list) parent.add(list);
    for (const item of key.placed) {
      const top = keyTop + item.row * keyLine;
      const mark = () => item.draw(item.x, top + keyMid);
      if (parent) artifact(doc, mark);
      else mark();
      tag(list, "LI", () => {
        doc
          .font("regular")
          .fontSize(keySize)
          .fillColor(BLACK)
          .text(item.label, item.x + keyMark + keyLabelGap, top, {
            lineBreak: false,
          });
      });
    }
    list?.end();
    const note = keyNoteText(textPage);
    tag(parent, "P", () => {
      doc
        .font("bold")
        .fontSize(keyNoteSize(note))
        .fillColor(BLACK)
        .text(note, MARGIN, keyNoteTop(note), { lineBreak: false });
    });
  };

  // ------------------------------------------------------------ panel
  // GOV.UK Warning text on the grey band, then the other notes, each after
  // its icon, as the leaflet's: that no one has checked the dates yet (as on
  // the page), the put-out time and the line about the next year's dates.
  type Note = { icon: typeof PDF_ICONS.later; text: string };
  const warnD = px(35);
  const noteX = MARGIN + warnD + px(15);
  const noteW = CONTENT_W - warnD - px(15);
  const notes: Note[] = [
    ...(place.verified
      ? []
      : [{ icon: PDF_ICONS.unverified, text: unverifiedNote(place.gmina) }]),
    ...(putOut ? [{ icon: PDF_ICONS.putOut, text: putOut }] : []),
    ...(laterText ? [{ icon: PDF_ICONS.later, text: laterText }] : []),
  ];
  const noteH = (note: Note) => {
    doc.font("regular").fontSize(px(19));
    return doc.heightOfString(note.text, { width: noteW });
  };
  const warnH = () => {
    doc.font("bold").fontSize(px(19));
    return Math.max(warnD, doc.heightOfString(warningText, { width: noteW }));
  };
  // 12 above the circle and 12 below the last ink: the last note's
  // descenders, or the warning's or the circle's without notes.
  const panelH = (() => {
    const below = (font: string, text: string) =>
      px(19) * (LINE - ASCENT) - inkOf(font, px(19), text).below;
    const last = notes.at(-1);
    if (last) {
      const end =
        12 + warnH() + notes.reduce((sum, n) => sum + 8 + noteH(n), 0);
      return end - below("regular", last.text) + 12;
    }
    doc.font("bold").fontSize(px(19));
    const text = 15 + doc.heightOfString(warningText, { width: noteW });
    return Math.max(12 + warnD, text - below("bold", warningText)) + 12;
  })();

  const drawPanel = (top: number) => {
    artifact(doc, () => {
      doc.rect(0, top, PAGE_W, panelH).fillColor(PANEL).fill();
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
      const noteTop = y + 8;
      // The icon in the warning's column, on the note's first line.
      const size = px(19) * 1.15;
      artifact(doc, () =>
        drawIcon(
          doc,
          note.icon,
          MARGIN + (warnD - size) / 2,
          noteTop + px(19) * (ASCENT - CAP / 2) - size / 2,
          size,
          BLACK,
        ),
      );
      tag(root, "P", () => {
        doc
          .font("regular")
          .fontSize(px(19))
          .fillColor(BLACK)
          .text(note.text, noteX, noteTop, { width: noteW });
      });
      y += 8 + noteH(note);
    }
    return top + panelH;
  };

  // ------------------------------------------------------------ grid
  // The leaflet's grid: four small month tables a row, each a grey bar with
  // the month, a header row and a row per date with its marks. Rows shrink
  // (20 down to 14 pt) until the whole period fits one page.
  const captionText = px(19);
  const cellText = px(16);
  // Dates and "Dzień" start this far in: the red cell's even inner padding.
  const inset = 3;
  const dateText = (day: PickupDay) => {
    const n = String(Number(day.date.slice(8)));
    return usual && !moved(day) && !odd(day)
      ? n
      : `${n} ${weekdayShort(day.date)}`;
  };
  // As wide as the widest date with its red cell's padding, and a gap.
  doc.font("bold").fontSize(cellText);
  const dateW = Math.max(
    24,
    ...inWindow.map((day) => doc.widthOfString(dateText(day)) + 2 * inset + 5),
  );
  const rowGap = 12;
  const yearH = px(24) * 1.5;
  const MAX_ROW = 20;
  const MIN_ROW = 14;
  let rowH = MAX_ROW;
  const capH = () => rowH + 4;
  const mark = () => Math.min(11.5, rowH * 0.6);
  const markGap = 4.5;
  const perLine = () =>
    Math.max(
      1,
      Math.floor((TABLE_W - dateW - 4 + markGap) / (mark() + markGap)),
    );
  const lines = (day: PickupDay) =>
    Math.max(
      1,
      Math.ceil(
        day.pickups.flatMap((p) => tones(p.subtype)).length / perLine(),
      ),
    );
  // Tables in a row share the height of the row's tallest month.
  const slots = (keys: string[]) =>
    Math.max(
      1,
      ...keys.map((key) =>
        (byMonth.get(key) ?? []).reduce((sum, day) => sum + lines(day), 0),
      ),
    );
  const tableH = (keys: string[]) => capH() + rowH * (slots(keys) + 1);

  const drawMonth = (
    key: string,
    rowYear: string,
    x: number,
    y: number,
    rowSlots: number,
  ) => {
    const days = byMonth.get(key) ?? [];
    // A year that starts inside a row is named in its first month's bar.
    const name =
      key.slice(0, 4) === rowYear ? monthName(key) : monthTitle(`${key}-01`);
    artifact(doc, () => {
      doc.rect(x, y, TABLE_W, capH()).fillColor(PANEL).fill();
    });
    tag(root, "H3", () => {
      doc
        .font("bold")
        .fontSize(captionText)
        .fillColor(BLACK)
        .text(name, x + inset, capCentred(captionText, y, capH()), {
          lineBreak: false,
        });
    });
    const head = y + capH();
    const table = doc.struct("Table");
    root.add(table);
    const headRow = doc.struct("TR");
    table.add(headRow);
    const headY = capCentred(cellText, head, rowH);
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
      // Highlighted only where the data says the date moved.
      const from = moved(day);
      const text = dateText(day);
      const top = rowTop;
      // The red hugs its text, so the marks keep their usual distance.
      const textW = doc.font("bold").fontSize(cellText).widthOfString(text);
      artifact(doc, () => {
        if (from) {
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
            .fillColor(from ? ink(RED) : BLACK)
            .text(text, x + inset, capCentred(cellText, top, rowH), {
              lineBreak: false,
            });
        }),
      );
      const marks = day.pickups.flatMap((p) => tones(p.subtype));
      tr.add(
        doc.struct("TD", { actual: label(day.pickups) }, () => {
          marks.forEach((tone, i) => {
            const line = Math.floor(i / perLine());
            const col = i % perLine();
            drawMark(
              doc,
              tone,
              x + dateW + 4 + mark() / 2 + col * (mark() + markGap),
              top + line * rowH + rowH / 2,
              mark(),
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
  const gridTop = bandH + panelH + 16;
  // A year heading above the first row and wherever a new year starts.
  const years = rows.filter(
    (row, i) => i === 0 || row[0].slice(0, 4) !== rows[i - 1][0].slice(0, 4),
  ).length;
  const gridH = () =>
    years * yearH +
    rows.reduce((sum, row) => sum + tableH(row), 0) +
    rowGap * Math.max(0, rows.length - 1);
  const gridBottom = keyFor(printed).top - 12;
  while (rowH > MIN_ROW && gridTop + gridH() > gridBottom) rowH -= 0.5;

  // More than a page holds even at the smallest rows: later rows go on, on
  // pages of their own, below the compact band.
  const CONTINUED_TOP = compactH + 22;
  const plan = (() => {
    const breaks: number[] = [];
    // Each page's months, for its key.
    const pages: string[][] = [[]];
    let y = gridTop;
    let year = "";
    rows.forEach((row, i) => {
      const need = tableH(row) + (row[0].slice(0, 4) !== year ? yearH : 0);
      const keyTop = keyFor([...(pages.at(-1) ?? []), ...row]).top;
      if (y + need > keyTop - 12 && i > 0) {
        breaks.push(i);
        pages.push([]);
        y = CONTINUED_TOP;
        year = "";
      }
      pages.at(-1)?.push(...row);
      if (row[0].slice(0, 4) !== year) {
        year = row[0].slice(0, 4);
        y += yearH;
      }
      y += tableH(row) + rowGap;
    });
    return { breaks, keys: pages.map(keyFor) };
  })();
  const pageBreaks = plan.breaks;
  const textPage = pageBreaks.length + 1 + guidePages + 1;

  let y = drawPanel(drawBand()) + 16;
  let year = "";
  let page = 1;
  const yearsTagged = new Set<string>();
  rows.forEach((row, i) => {
    if (pageBreaks.includes(i)) {
      if (page === 1) drawKey(root, textPage, plan.keys[0]);
      else artifact(doc, () => drawKey(null, textPage, plan.keys[page - 1]));
      mainFooter.artifact();
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
    y += tableH(row) + rowGap;
  });
  if (page === 1) drawKey(root, textPage, plan.keys[0]);
  else artifact(doc, () => drawKey(null, textPage, plan.keys[page - 1]));
  mainFooter.artifact();

  drawGuide();

  // ------------------------------------------------------------ text version
  // No colours and no marks: the same dates as a list.
  doc.addPage();
  y = compactBand("wersja tekstowa", root) + 18;
  const textBottom = mainFooter.top - 14;
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
  const continuedTop = compactH + 18;
  const placed = flow(blocks, y, continuedTop, textBottom);
  let textPageNow = 0;
  const toPage = (spot: Spot) => {
    while (textPageNow < spot.page) {
      mainFooter.artifact();
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
  mainFooter.draw(root);

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
