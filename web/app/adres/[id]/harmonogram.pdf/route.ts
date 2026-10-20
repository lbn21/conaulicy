import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { longDate, monthTitle, weekdayShort } from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { cacheControl } from "@/lib/gate";
import { withHouseNumber } from "@/lib/house";
import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  PLATE,
  RIM,
  RIM_WIDTH,
  UL,
  WORDMARK,
  WORDMARK_X,
} from "@/lib/logo";
import { normalize } from "@/lib/normalize";
import {
  getPlace,
  type Pickup,
  type PickupDay,
  type PlaceView,
} from "@/lib/schedule";
import {
  BIN,
  BIN_HEIGHT,
  BIN_WIDTH,
  OUTLINED,
  TOKEN,
  tones,
} from "@/lib/waste-bin";

export const runtime = "nodejs";

// Printed QR codes and links must point at the permanent address, never at a
// preview deployment.
const SITE_URL = "https://conaulicy.pl";

// Bundled through outputFileTracingIncludes in next.config.ts.
const FONT_DIR = path.join(process.cwd(), "assets/fonts");
const REGULAR = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Regular.ttf"),
);
const BOLD = readFileSync(
  path.join(FONT_DIR, "AtkinsonHyperlegibleNext-Bold.ttf"),
);

// A4 portrait in points, 10 mm margins. Page 1 is laid out like the Wigan
// council calendar (docs/inspiration/wigan-calendar.png); the last page is a
// text-only version, like Wigan's, for black-and-white and colour-blind use.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;
const COLUMNS = 3;
const COLUMN_GAP = 12;
const TABLE_W = (CONTENT_W - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;

// Latarnia tokens (design/tokens.css): dark theme for the header band, light
// theme for everything printed on white.
const NAVY = "#10141d";
const AMBER = "#ffb547";
const WHITE = "#ffffff";
const TEXT = "#161b24";
const MUTED = "#4a5568";
const SURFACE_2 = "#eef1f5";
const SECONDARY = "#e8ecf2";
const RULE = "#b4bcc8";
const DANGER = "#b42318";

type Colours = { fill: string; border: string };

const WASTE: Record<string, Colours> = {
  zmieszane: { fill: "#111111", border: "#111111" },
  papier: { fill: "#1f63c7", border: "#1f63c7" },
  "plastik-metale": { fill: "#f2c200", border: "#7d6200" },
  szklo: { fill: "#1e7f4f", border: "#1e7f4f" },
  bio: { fill: "#7a4b2a", border: "#7a4b2a" },
  popiol: { fill: "#5c6370", border: "#5c6370" },
  gabaryty: { fill: "#c2410c", border: "#c2410c" },
  elektro: { fill: "#1e3a8a", border: "#1e3a8a" },
  opony: { fill: "#a3aab5", border: "#4a5160" },
  tekstylia: { fill: "#a8336a", border: "#a8336a" },
};

function shade(hex: string, percent: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round((c * percent) / 100)
      .toString(16)
      .padStart(2, "0");
  return `#${mix((n >> 16) & 0xff)}${mix((n >> 8) & 0xff)}${mix(n & 0xff)}`;
}

/** The website's wheelie bin (lib/waste-bin.ts), in light-theme colours. */
function drawBin(
  doc: PDFKit.PDFDocument,
  tone: string,
  x: number,
  y: number,
  height: number,
) {
  const token = TOKEN[tone] ?? "zmieszane";
  const c = WASTE[token];
  const outlined = OUTLINED.has(token);
  const paint = (fill: string, stroke = true) => {
    doc.fillColor(fill);
    if (outlined && stroke) {
      doc.lineWidth(1.2).strokeColor(c.border).fillAndStroke();
    } else {
      doc.fill();
    }
  };
  doc.save();
  doc.translate(x, y).scale(height / BIN_HEIGHT);
  doc.lineJoin("round");
  const { handle, rim, lid, foot, wheel, hub } = BIN;
  doc.roundedRect(handle.x, handle.y, handle.width, handle.height, handle.rx);
  paint(shade(c.fill, handle.shade));
  doc.path(BIN.body);
  paint(c.fill);
  doc.path(rim.d);
  paint(shade(c.fill, rim.shade), false);
  doc.path(lid.d);
  paint(shade(c.fill, lid.shade));
  doc.roundedRect(foot.x, foot.y, foot.width, foot.height, foot.rx);
  paint(shade(c.fill, foot.shade));
  doc.circle(wheel.cx, wheel.cy, wheel.r);
  paint(shade(c.fill, wheel.shade));
  doc.circle(hub.cx, hub.cy, hub.r);
  paint(c.fill, false);
  doc.restore();
}

function binWidth(height: number): number {
  return (height * BIN_WIDTH) / BIN_HEIGHT;
}

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
  doc.fillColor("#000000").fill();
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

/** The weekday shared by every pickup, or null when they differ. */
function commonWeekday(days: PickupDay[]): string | null {
  const names = new Set(days.map((day) => weekdayName(day.date)));
  return names.size === 1 ? [...names][0] : null;
}

/** Day number alone when every pickup shares a weekday, else "19 pon". */
function dayText(iso: string, sameWeekday: boolean): string {
  const day = String(Number(iso.slice(8)));
  return sameWeekday ? day : `${day} ${weekdayShort(iso)}`;
}

function monthName(key: string): string {
  return monthTitle(`${key}-01`).replace(/ \d{4}$/, "");
}

function label(pickups: Pickup[]): string {
  return pickups.map((p) => p.label).join(", ");
}

function spoken(day: PickupDay): string {
  const moved = day.pickups.find((p) => p.shiftedFrom)?.shiftedFrom;
  const when = absoluteDay(day.date);
  return moved ? `${when} (termin przesunięty z ${absoluteDay(moved)})` : when;
}

// Month tables, like Wigan's: every table has the same number of row slots
// (at least ROWS, empty slots stay blank), and every table in a grid row has
// the same height. A day whose bins do not fit one line takes more slots.
const ROWS = 5;
const BIN_GAP = 2;
const MAX_BIN = 34;
const MIN_BIN = 18;
const MONTH_HEAD = 22;
const COLUMN_HEAD = 16;
const YEAR_HEAD = 22;
const ROW_GAP = 10;

type Grid = {
  dayCol: number;
  sameWeekday: boolean;
  binH: number;
  /** Height of one row slot. */
  lineH: number;
  perLine: number;
};

function grid(binH: number, dayCol: number, sameWeekday: boolean): Grid {
  return {
    dayCol,
    sameWeekday,
    binH,
    lineH: binH + 5,
    perLine: Math.max(
      1,
      Math.floor((TABLE_W - dayCol - 8 + BIN_GAP) / (binWidth(binH) + BIN_GAP)),
    ),
  };
}

function binLines(day: PickupDay, g: Grid): number {
  const bins = day.pickups.reduce((n, p) => n + tones(p.subtype).length, 0);
  return Math.max(1, Math.ceil(bins / g.perLine));
}

/** Row slots a month needs: one per day (more for wrapped bins), at least ROWS. */
function monthSlots(days: PickupDay[] | undefined, g: Grid): number {
  if (!days) return ROWS;
  const used = days.reduce((n, day) => n + binLines(day, g), 0);
  return Math.max(ROWS, used);
}

type GridRow = { months: string[]; slots: number; height: number };

const ROWS_PER_PAGE = 2;

/** Three months per row; every table in a row shares the row's slot count. */
function gridRows(
  months: string[],
  byMonth: Map<string, PickupDay[]>,
  g: Grid,
): GridRow[] {
  const rows: GridRow[] = [];
  for (let i = 0; i < months.length; i += COLUMNS) {
    const row = months.slice(i, i + COLUMNS);
    const slots = Math.max(
      ...row.map((key) => monthSlots(byMonth.get(key), g)),
    );
    rows.push({
      months: row,
      slots,
      height: YEAR_HEAD + MONTH_HEAD + COLUMN_HEAD + slots * g.lineH,
    });
  }
  return rows;
}

function rowsHeight(rows: GridRow[]): number {
  return (
    rows.reduce((h, row) => h + row.height, 0) + ROW_GAP * (rows.length - 1)
  );
}

const CONTINUED_TOP = MARGIN + 40;

/** Consecutive months without data, as "styczeń–wrzesień 2027". */
function emptyRange(keys: string[]): string {
  const first = keys[0];
  const last = keys[keys.length - 1];
  const name = (key: string) => monthName(key).toLowerCase();
  if (first === last) return `${name(first)} ${first.slice(0, 4)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${name(first)}–${name(last)} ${last.slice(0, 4)}`;
  }
  return `${name(first)} ${first.slice(0, 4)} – ${name(last)} ${last.slice(0, 4)}`;
}

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
  const period = `${monthTitle(`${months[0]}-01`).toLowerCase()} – ${monthTitle(`${months[MONTHS - 1]}-01`).toLowerCase()}`;
  const weekday = commonWeekday(inWindow);
  const shifted = inWindow.some((day) =>
    day.pickups.some((p) => p.shiftedFrom),
  );
  const putOutBy = inWindow
    .flatMap((day) => day.pickups)
    .find((p) => p.putOutBy)?.putOutBy;
  const putOut = putOutBy
    ? `Wystaw pojemniki do ${putOutBy.replace(/^0/, "")} w dniu odbioru.`
    : null;

  const doc = new PDFDocument({
    size: "A4",
    // The layout keeps its own margins; a small bottom margin stops PDFKit
    // from adding a page when the footer ends right at the edge.
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 4 },
    pdfVersion: "1.7",
    tagged: true,
    // @types/pdfkit lags behind 0.20, which supports PDF/UA.
    subset: "PDF/UA" as PDFKit.Mixins.PDFSubsets,
    lang: "pl-PL",
    displayTitle: true,
    font: REGULAR as unknown as string,
    info: {
      Title: `Harmonogram odbioru odpadów – ${place.label}`,
      Author: "conaulicy.pl",
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
  // Content repeated on later pages (footer, key, continued headers) is
  // tagged once and drawn as an artifact elsewhere.
  const tag = (
    parent: PDFKit.PDFStructureElement | null,
    type: string,
    draw: () => void,
    options: { actual?: string } = {},
  ) => {
    if (parent) parent.add(doc.struct(type, options, draw));
    else draw();
  };

  // Footer: every source with its link and last-checked date, on every page.
  const footerLines = place.sources.map((source) => {
    const checked = source.checkedAt
      ? ` · Stan na ${longDate(source.checkedAt)}`
      : "";
    return { text: `Źródło: ${source.label}${checked}`, url: source.url };
  });
  const closing = "Serwis nieoficjalny – obowiązuje harmonogram gminy.";
  doc.font("regular").fontSize(9);
  let footerH = 0;
  for (const line of footerLines) {
    footerH += doc.heightOfString(line.text, { width: CONTENT_W });
    if (line.url) footerH += doc.heightOfString(line.url, { width: CONTENT_W });
  }
  doc.font("bold").fontSize(9.5);
  footerH += doc.heightOfString(closing, { width: CONTENT_W }) + 4;
  const footerTop = PAGE_H - MARGIN - footerH;

  const drawFooter = (parent: PDFKit.PDFStructureElement | null) => {
    let fy = footerTop;
    for (const line of footerLines) {
      const top = fy;
      tag(parent, "P", () => {
        doc
          .font("regular")
          .fontSize(9)
          .fillColor(MUTED)
          .text(line.text, MARGIN, top, { width: CONTENT_W });
        if (line.url) doc.text(line.url, { width: CONTENT_W, link: line.url });
      });
      fy = doc.y;
    }
    const closingTop = fy + 4;
    tag(parent, "P", () => {
      doc
        .font("bold")
        .fontSize(9.5)
        .fillColor(TEXT)
        .text(closing, MARGIN, closingTop, { width: CONTENT_W });
    });
  };
  const footerArtifact = () => artifact(doc, () => drawFooter(null));

  // Key entries, wrapped onto more lines when they do not fit one.
  const keyBin = 22;
  const keyLine = 28;
  const legend = new Map<string, Pickup>();
  for (const pickup of inWindow.flatMap((day) => day.pickups)) {
    if (!legend.has(pickup.subtype)) legend.set(pickup.subtype, pickup);
  }
  const keyItems: Array<{ bins: string[]; label: string }> = [
    ...[...legend.entries()].map(([subtype, pickup]) => ({
      bins: tones(subtype),
      label: pickup.label,
    })),
    ...(shifted ? [{ bins: [], label: "Termin przesunięty" }] : []),
  ];
  doc.font("regular").fontSize(11);
  const keyStart = MARGIN + 82;
  let kx = keyStart;
  let keyRow = 0;
  const keyPlaced = keyItems.map((item) => {
    const markW = item.bins.length
      ? item.bins.length * (binWidth(keyBin) + 2) + 3
      : 22;
    const w = markW + doc.widthOfString(item.label);
    if (kx > keyStart && kx + w > PAGE_W - MARGIN) {
      kx = keyStart;
      keyRow++;
    }
    const placed = { ...item, x: kx, row: keyRow, markW };
    kx += w + 14;
    return placed;
  });
  const NOTE_H = 18;
  const legendH = 32 + keyRow * keyLine + NOTE_H;
  const legendTop = footerTop - 10 - legendH;

  // Month grid layout.
  doc.font("bold").fontSize(13);
  const sameWeekday = weekday !== null;
  const dayCol =
    Math.max(
      26,
      ...inWindow.map((day) =>
        doc.widthOfString(dayText(day.date, sameWeekday)),
      ),
    ) + 14;

  // Page 1 header band, Latarnia navy with an amber edge.
  const bandBottom = drawBand(doc, root, {
    kicker: `Harmonogram odbioru odpadów · ${period}`,
    title: place.label,
    titleSize: 26,
    dayLine: weekday ? `Twój dzień odbioru: ${weekday}` : null,
  });

  // Info strip: only facts we have.
  const notes: Array<{ icon: "warn" | "clock"; bold: string; text: string }> = [
    {
      icon: "warn",
      bold: "Terminy mogą się zmienić.",
      text: " Aktualne znajdziesz zawsze na conaulicy.pl. Gdyby coś się nie zgadzało, rację ma harmonogram gminy.",
    },
  ];
  if (putOutBy) {
    notes.push({
      icon: "clock",
      bold: `Wystaw pojemniki do ${putOutBy.replace(/^0/, "")}`,
      text: " w dniu odbioru.",
    });
  }
  const gridTop = drawStrip(doc, root, notes, url, bandBottom + 12) + 12;

  // Two calendar pages of six months (2 rows × 3 tables), then the text
  // version. The second calendar page is left out when none of its months
  // has published dates. Bins get the largest size at which the calendar
  // pages fit, the same on both; extra bins wrap to a second line instead of
  // shrinking, and only a rare 6–7 date month pushes them below the target.
  const gridBottom = legendTop - 8;
  const compactBand: Band = {
    kicker: `Harmonogram odbioru odpadów · ${period}`,
    title: place.label,
    titleSize: 18,
    dayLine: null,
  };
  const page2Top = bandHeight(doc, compactBand) + 16;
  const secondPage = months
    .slice(ROWS_PER_PAGE * COLUMNS)
    .some((key) => byMonth.has(key));
  const pageTops = secondPage ? [gridTop, page2Top] : [gridTop];
  const fits = (candidate: Grid) => {
    const rows = gridRows(months, byMonth, candidate);
    return pageTops.every(
      (top, page) =>
        top +
          rowsHeight(
            rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
          ) <=
        gridBottom,
    );
  };
  let g = grid(MIN_BIN, dayCol, sameWeekday);
  for (let binH = MAX_BIN; binH >= MIN_BIN; binH--) {
    const candidate = grid(binH, dayCol, sameWeekday);
    if (fits(candidate)) {
      g = candidate;
      break;
    }
  }
  const rows = gridRows(months, byMonth, g);
  const pages = pageTops.map((_, page) =>
    rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
  );
  const textPage = pages.length + 1;

  const drawKey = (parent: PDFKit.PDFStructureElement | null) => {
    // Marked content cannot nest: when the whole key is already an artifact
    // (parent null), draw decoration directly.
    const decoration = (draw: () => void) => {
      if (parent) artifact(doc, draw);
      else draw();
    };
    decoration(() => {
      doc
        .moveTo(MARGIN, legendTop - 4)
        .lineTo(PAGE_W - MARGIN, legendTop - 4)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
    });
    tag(parent, "H2", () => {
      doc
        .font("bold")
        .fontSize(12)
        .fillColor(TEXT)
        .text("Oznaczenia", MARGIN, legendTop + 9, { lineBreak: false });
    });
    const keyList = parent ? doc.struct("L") : null;
    if (parent && keyList) parent.add(keyList);
    for (const item of keyPlaced) {
      const top = legendTop + item.row * keyLine;
      const marks = () => {
        if (item.bins.length === 0) {
          doc
            .rect(item.x, top + 8, 18, 14)
            .fillColor(DANGER)
            .fill();
        }
        item.bins.forEach((tone, i) => {
          drawBin(
            doc,
            tone,
            item.x + i * (binWidth(keyBin) + 2),
            top + 4,
            keyBin,
          );
        });
      };
      if (parent) artifact(doc, marks);
      else marks();
      tag(keyList, "LI", () => {
        doc
          .font("regular")
          .fontSize(11)
          .fillColor(TEXT)
          .text(item.label, item.x + item.markW, top + 10, {
            lineBreak: false,
          });
      });
    }
    keyList?.end();
    const noteTop = legendTop + legendH - NOTE_H + 2;
    tag(parent, "P", () => {
      doc
        .font("bold")
        .fontSize(10)
        .fillColor(TEXT)
        .text(
          `Wersja tekstowa (bez kolorów i ikon) na stronie ${textPage}.`,
          MARGIN,
          noteTop,
          { width: CONTENT_W },
        );
    });
  };

  // Calendar pages. A year heading sits above the first month of each year
  // in reading order (tagged H2). At the top of page 2, a year carried over
  // from page 1 is repeated, as decoration, above the first column.
  pages.forEach((pageRows, index) => {
    let y = gridTop;
    if (index > 0) {
      doc.addPage();
      artifact(doc, () => drawBand(doc, null, compactBand));
      y = page2Top;
    }
    pageRows.forEach((row, rowIndex) => {
      const top = y;
      row.months.forEach((key, column) => {
        const x = MARGIN + column * (TABLE_W + COLUMN_GAP);
        const year = key.slice(0, 4);
        const opens = key === months[0] || key.endsWith("-01");
        if (opens || (index > 0 && rowIndex === 0 && column === 0)) {
          const heading = () => {
            doc
              .font("bold")
              .fontSize(15)
              .fillColor(TEXT)
              .text(year, x, top, { lineBreak: false });
          };
          if (opens) tag(root, "H2", heading);
          else artifact(doc, heading);
        }
        drawMonth(doc, root, {
          key,
          days: byMonth.get(key),
          x,
          y: top + YEAR_HEAD,
          g,
          slots: row.slots,
        });
      });
      y += row.height + ROW_GAP;
    });
    // The key is tagged once, on page 1; the footer once, on the last page.
    if (index === 0) drawKey(root);
    else artifact(doc, () => drawKey(null));
    footerArtifact();
  });

  // Text-only version, like Wigan's: no colours, no icons.
  doc.addPage();
  let y = drawBand(doc, root, {
    kicker: `Wersja tekstowa · ${period}`,
    title: place.label,
    titleSize: 18,
    dayLine: weekday ? `Twój dzień odbioru: ${weekday}` : null,
  });
  y += 14;
  const textBottom = footerTop - 14;
  const intro = [
    "Te same terminy co w kalendarzu, w formie listy.",
    ...(putOut ? [putOut] : []),
    `Terminy mogą się zmienić. Aktualne: ${url.replace("https://", "")}`,
  ];
  for (const line of intro) {
    const top = y;
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(11)
        .fillColor(TEXT)
        .text(line, MARGIN, top, { width: CONTENT_W });
    });
    y = doc.y + 2;
  }
  y += 8;

  const ensure = (height: number) => {
    if (y + height <= textBottom) return;
    footerArtifact();
    doc.addPage();
    artifact(doc, () =>
      continuedHeader(doc, `${place.label} – wersja tekstowa`),
    );
    y = CONTINUED_TOP;
  };

  // Chronological: months with data in full, gaps collapsed into one line.
  let gap: string[] = [];
  const flushGap = () => {
    if (gap.length === 0) return;
    const text = `${emptyRange(gap)}: terminy jeszcze nieogłoszone`;
    gap = [];
    ensure(22);
    const top = y;
    tag(root, "P", () => {
      doc
        .font("bold")
        .fontSize(11.5)
        .fillColor(TEXT)
        .text(text, MARGIN, top, { width: CONTENT_W });
    });
    y = doc.y + 10;
  };
  for (const key of months) {
    const days = byMonth.get(key);
    if (!days) {
      gap.push(key);
      continue;
    }
    flushGap();
    ensure(22 + 17);
    const section = doc.struct("Sect");
    root.add(section);
    const headTop = y;
    tag(section, "H2", () => {
      doc
        .font("bold")
        .fontSize(13)
        .fillColor(TEXT)
        .text(monthTitle(`${key}-01`), MARGIN, headTop, { width: CONTENT_W });
    });
    y = doc.y + 3;
    const list = doc.struct("L");
    section.add(list);
    for (const day of days) {
      const text = `${spoken(day)} – ${label(day.pickups)}`;
      doc.font("regular").fontSize(11.5);
      const h = doc.heightOfString(text, { width: CONTENT_W - 12 });
      ensure(h + 3);
      const top = y;
      tag(list, "LI", () => {
        doc
          .font("regular")
          .fontSize(11.5)
          .fillColor(TEXT)
          .text(text, MARGIN + 12, top, { width: CONTENT_W - 12 });
      });
      y = doc.y + 3;
    }
    list.end();
    section.end();
    y += 8;
  }
  flushGap();
  drawFooter(root);

  root.end();
  doc.end();
  return done;
}

type Band = {
  kicker: string;
  title: string;
  titleSize: number;
  dayLine: string | null;
};

function bandLayout(band: Band) {
  const compact = band.titleSize < 22;
  const logoW = compact ? 120 : 150;
  return {
    compact,
    logoW,
    textW: CONTENT_W - logoW - 16,
    daySize: compact ? 13 : 19,
  };
}

function bandHeight(doc: PDFKit.PDFDocument, band: Band): number {
  const { compact, textW, daySize } = bandLayout(band);
  doc.font("regular").fontSize(11);
  let height = 22 + doc.heightOfString(band.kicker, { width: textW }) + 4;
  doc.font("bold").fontSize(band.titleSize);
  height += doc.heightOfString(band.title, { width: textW });
  if (band.dayLine) {
    doc.fontSize(daySize);
    height += 6 + doc.heightOfString(band.dayLine, { width: textW });
  }
  return Math.max(height + 18, compact ? 80 : 104);
}

/**
 * Full-width navy band with the wordmark top right. Returns its bottom.
 * With root null (a repeated band) the caller wraps it all in one artifact.
 */
function drawBand(
  doc: PDFKit.PDFDocument,
  root: PDFKit.PDFStructureElement | null,
  band: Band,
): number {
  const { compact, logoW, textW, daySize } = bandLayout(band);
  const height = bandHeight(doc, band);
  const tagged = (type: string, draw: () => void) => {
    if (root) root.add(doc.struct(type, {}, draw));
    else draw();
  };
  const decoration = (draw: () => void) => {
    if (root) artifact(doc, draw);
    else draw();
  };
  decoration(() => {
    doc.rect(0, 0, PAGE_W, height).fillColor(NAVY).fill();
    doc
      .rect(0, height - 4, PAGE_W, 4)
      .fillColor(AMBER)
      .fill();
  });
  tagged("P", () => {
    doc
      .font("regular")
      .fontSize(11)
      .fillColor(WHITE)
      .text(band.kicker, MARGIN, 22, { width: textW });
  });
  tagged("H1", () => {
    doc
      .font("bold")
      .fontSize(band.titleSize)
      .fillColor(WHITE)
      .text(band.title, MARGIN, doc.y + 4, { width: textW });
  });
  const dayLine = band.dayLine;
  if (dayLine) {
    tagged("P", () => {
      doc
        .font("bold")
        .fontSize(daySize)
        .fillColor(AMBER)
        .text(dayLine, MARGIN, doc.y + 6, { width: textW });
    });
  }

  // Our logo where Wigan has its crest: the flat "ul." plate and wordmark
  // (docs/brand.md), as vector paths. On navy the rim and "ul." are painted
  // navy, which reads exactly like the site's cut-outs.
  const s = (logoW - 6) / LOGO_WIDTH;
  const lx = PAGE_W - MARGIN - logoW + 6;
  const wordX = lx + WORDMARK_X * s;
  const linkY = 24 + LOGO_HEIGHT * s + 6;
  decoration(() => {
    doc.save().translate(lx, 24).scale(s);
    doc.path(PLATE).fillColor(AMBER).fill();
    doc.path(RIM).lineWidth(RIM_WIDTH).strokeColor(NAVY).stroke();
    doc.path(UL).fillColor(NAVY).fill();
    doc.path(WORDMARK).fillColor(WHITE).fill();
    doc.restore();
  });
  tagged("P", () => {
    doc
      .font("regular")
      .fontSize(compact ? 10 : 11)
      .fillColor(AMBER)
      .text("conaulicy.pl", wordX, linkY, {
        width: PAGE_W - MARGIN - wordX,
        link: SITE_URL,
        lineBreak: false,
      });
  });
  return height;
}

/** The info strip with icons and the QR code. Returns its bottom. */
function drawStrip(
  doc: PDFKit.PDFDocument,
  root: PDFKit.PDFStructureElement,
  notes: Array<{ icon: "warn" | "clock"; bold: string; text: string }>,
  url: string,
  stripTop: number,
): number {
  const qrSize = 58;
  const qrTextW = 120;
  const noteX = MARGIN + 50;
  const noteW = CONTENT_W - 50 - qrSize - qrTextW - 30;
  doc.font("regular").fontSize(11);
  const noteH = notes.map((note) =>
    Math.max(doc.heightOfString(note.bold + note.text, { width: noteW }), 28),
  );
  const stripH = Math.max(
    20 + noteH.reduce((sum, h) => sum + h + 8, -8),
    qrSize + 20,
  );
  artifact(doc, () => {
    doc.rect(MARGIN, stripTop, CONTENT_W, stripH).fillColor(SURFACE_2).fill();
  });
  let y = stripTop + 10;
  notes.forEach((note, i) => {
    const top = y;
    artifact(doc, () => {
      const cx = MARGIN + 24;
      if (note.icon === "warn") {
        doc
          .polygon([cx, top], [cx + 16, top + 27], [cx - 16, top + 27])
          .lineJoin("round")
          .lineWidth(1.5)
          .fillColor(AMBER)
          .strokeColor(NAVY)
          .fillAndStroke();
        doc
          .font("bold")
          .fontSize(15)
          .fillColor(NAVY)
          .text("!", cx - 2.5, top + 9, { lineBreak: false });
      } else {
        doc
          .circle(cx, top + 14, 13)
          .lineWidth(2)
          .strokeColor(NAVY)
          .stroke();
        doc
          .moveTo(cx, top + 6)
          .lineTo(cx, top + 14)
          .lineTo(cx + 6, top + 18)
          .lineWidth(2)
          .lineCap("round")
          .strokeColor(NAVY)
          .stroke();
      }
    });
    root.add(
      doc.struct("P", {}, () => {
        doc
          .font("bold")
          .fontSize(11)
          .fillColor(TEXT)
          .text(note.bold, noteX, top + 2, { width: noteW, continued: true })
          .font("regular")
          .text(note.text);
      }),
    );
    y = top + noteH[i] + 8;
  });
  const qrX = PAGE_W - MARGIN - 10 - qrSize;
  const qrTop = stripTop + (stripH - qrSize) / 2;
  artifact(doc, () => drawQr(doc, url, qrX, qrTop, qrSize));
  root.add(
    doc.struct("P", {}, () => {
      doc
        .font("bold")
        .fontSize(11)
        .fillColor(TEXT)
        .text("Zeskanuj –", qrX - qrTextW - 8, qrTop + 6, {
          width: qrTextW,
          align: "right",
        })
        .text("aktualne terminy", { width: qrTextW, align: "right" })
        .font("regular")
        .fontSize(9)
        .fillColor(MUTED)
        .text(url.replace("https://", ""), {
          width: qrTextW,
          align: "right",
          link: url,
        });
    }),
  );
  return stripTop + stripH;
}

function continuedHeader(doc: PDFKit.PDFDocument, title: string) {
  doc
    .font("bold")
    .fontSize(13)
    .fillColor(TEXT)
    .text(`${title} – ciąg dalszy`, MARGIN, MARGIN, { width: CONTENT_W });
  doc
    .moveTo(MARGIN, MARGIN + 24)
    .lineTo(PAGE_W - MARGIN, MARGIN + 24)
    .lineWidth(1.5)
    .strokeColor(AMBER)
    .stroke();
}

type MonthTable = {
  key: string;
  days: PickupDay[] | undefined;
  x: number;
  y: number;
  g: Grid;
  /** Row slots of every table in this grid row, so they share one height. */
  slots: number;
};

function drawMonth(
  doc: PDFKit.PDFDocument,
  parent: PDFKit.PDFStructureElement,
  { key, days, x, y, g, slots }: MonthTable,
) {
  const name = monthName(key);
  const height = MONTH_HEAD + COLUMN_HEAD + slots * g.lineH;
  const bodyTop = y + MONTH_HEAD + COLUMN_HEAD;

  // Slot boundaries: each day takes as many slots as its bin lines; the rest
  // stay blank.
  const tops: number[] = [];
  let used = 0;
  for (const day of days ?? []) {
    tops.push(bodyTop + used * g.lineH);
    used += binLines(day, g);
  }
  const dayStarts = new Set(
    tops.map((t) => Math.round((t - bodyTop) / g.lineH)),
  );

  artifact(doc, () => {
    const rule = days ? RULE : "#d5dae1";
    if (days) doc.rect(x, y, TABLE_W, MONTH_HEAD).fillColor(SECONDARY).fill();
    doc
      .rect(x, y, TABLE_W, height)
      .lineWidth(days ? 0.75 : 0.5)
      .strokeColor(rule)
      .stroke();
    doc
      .moveTo(x, y + MONTH_HEAD)
      .lineTo(x + TABLE_W, y + MONTH_HEAD)
      .moveTo(x, bodyTop)
      .lineTo(x + TABLE_W, bodyTop)
      .lineWidth(days ? 0.5 : 0.4)
      .strokeColor(rule)
      .stroke();
    // Empty tables carry one note across the row, so no day column.
    if (days) {
      doc
        .moveTo(x + g.dayCol, y + MONTH_HEAD)
        .lineTo(x + g.dayCol, y + height)
        .lineWidth(0.5)
        .stroke();
    }
    for (let i = 1; i < slots; i++) {
      // Wrapped bin lines inside one day get no rule.
      if (i < used && !dayStarts.has(i)) continue;
      const ry = bodyTop + i * g.lineH;
      doc
        .moveTo(x, ry)
        .lineTo(x + TABLE_W, ry)
        .lineWidth(0.4)
        .strokeColor(rule)
        .stroke();
    }
  });

  parent.add(
    doc.struct("H3", {}, () => {
      doc
        .font("bold")
        .fontSize(13)
        .fillColor(days ? TEXT : MUTED)
        .text(name, x + 6, y + 4.5, { width: TABLE_W - 12, lineBreak: false });
    }),
  );

  const table = doc.struct("Table");
  parent.add(table);
  const head = doc.struct("TR");
  table.add(head);
  const headY = y + MONTH_HEAD + 3;
  head.add(
    doc.struct("TH", {}, () => {
      doc
        .font("regular")
        .fontSize(10)
        .fillColor(MUTED)
        .text("Dzień", x + 6, headY, { lineBreak: false });
    }),
  );
  head.add(
    doc.struct("TH", {}, () => {
      doc.text("Odbiór", x + g.dayCol + 6, headY, { lineBreak: false });
    }),
  );

  // No published dates: the same table, light, with a note in the first row.
  if (!days) {
    const tr = doc.struct("TR");
    table.add(tr);
    tr.add(
      doc.struct("TD", {}, () => {
        doc
          .font("regular")
          .fontSize(10)
          .fillColor(MUTED)
          .text(
            "Terminy jeszcze nieogłoszone",
            x + 6,
            bodyTop + (g.lineH - 12) / 2,
            { width: TABLE_W - 12, lineBreak: false },
          );
      }),
    );
    table.end();
    return;
  }

  days.forEach((day, i) => {
    const rowTop = tops[i];
    const rowH = binLines(day, g) * g.lineH;
    const moved = day.pickups.some((p) => p.shiftedFrom);
    if (moved) {
      artifact(doc, () => {
        doc
          .rect(x + 0.4, rowTop + 0.4, g.dayCol - 0.8, rowH - 0.8)
          .fillColor(DANGER)
          .fill();
      });
    }
    const tr = doc.struct("TR");
    table.add(tr);
    const dateSize = Math.min(15, Math.max(11, g.lineH * 0.45));
    tr.add(
      doc.struct("TD", { actual: spoken(day) }, () => {
        doc
          .font("bold")
          .fontSize(dateSize)
          .fillColor(moved ? WHITE : TEXT)
          .text(
            dayText(day.date, g.sameWeekday),
            x + 6,
            rowTop + (g.lineH - dateSize * 1.2) / 2,
            { width: g.dayCol - 8, lineBreak: false },
          );
      }),
    );
    const bins = day.pickups.flatMap((p) => tones(p.subtype));
    tr.add(
      doc.struct("TD", { actual: label(day.pickups) }, () => {
        bins.forEach((tone, j) => {
          const line = Math.floor(j / g.perLine);
          const col = j % g.perLine;
          drawBin(
            doc,
            tone,
            x + g.dayCol + 5 + col * (binWidth(g.binH) + BIN_GAP),
            rowTop + line * g.lineH + (g.lineH - g.binH) / 2,
            g.binH,
          );
        });
      }),
    );
  });
  table.end();
}

function slug(text: string): string {
  return normalize(text).replaceAll(" ", "-");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const found = await getPlace(id, new URL(request.url).searchParams.get("nr"));
  // With a house number: in the title, the file name and the printed link.
  const place = found && {
    ...found,
    label: withHouseNumber(found.label, found.nr),
  };
  if (!place || place.days.length === 0) {
    return new Response("Nie mamy harmonogramu dla tego adresu.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": cacheControl("public, s-maxage=3600"),
      },
    });
  }

  const pdf = await render(
    place,
    `${SITE_URL}/adres/${place.id}${place.nr ? `?nr=${place.nr}` : ""}`,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="harmonogram-${slug(place.label)}.pdf"`,
      // Short CDN life: an import purges our data cache, not the CDN copy.
      "Cache-Control": cacheControl(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      ),
    },
  });
}
