import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { longDate, monthTitle, weekdayShort } from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { cacheControl } from "@/lib/gate";
import {
  getPlace,
  normalize,
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

// A4 portrait in points, 10 mm margins. One page, laid out like the Wigan
// council calendar (docs/inspiration/wigan-calendar.png).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const MONTHS = 12;
const COLUMNS = 4;
const COLUMN_GAP = 12;
const TABLE_W = (CONTENT_W - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
const BIN_GAP = 1.5;

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
  gabaryty: { fill: "#a8336a", border: "#a8336a" },
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

type Metrics = {
  rowH: number;
  binH: number;
  date: number;
  dayCol: number;
};

// The date column fits the widest day label (`labelEm`: its width at 1pt);
// bins grow with the scale but never past the width the busiest day needs.
function metrics(k: number, maxBins: number, labelEm: number): Metrics {
  const date = Math.max(11, 12.5 * k);
  const dayCol = Math.max(labelEm * date, 26) + 12;
  const fit =
    ((TABLE_W - dayCol - 8) / maxBins - BIN_GAP) * (BIN_HEIGHT / BIN_WIDTH);
  return {
    rowH: 21 * k,
    binH: Math.min(17 * k, 21 * k - 3, fit),
    date,
    dayCol,
  };
}

/** Day number alone when every pickup shares a weekday, else "19 pon". */
function dayText(iso: string, sameWeekday: boolean): string {
  const day = String(Number(iso.slice(8)));
  return sameWeekday ? day : `${day} ${weekdayShort(iso)}`;
}

const MONTH_HEAD = 19;
const COLUMN_HEAD = 15;
const YEAR_HEAD = 22;
const ROW_GAP = 10;
const EMPTY_ROWS = 2;

function tableHeight(days: PickupDay[] | undefined, m: Metrics): number {
  const rows = days ? days.length : EMPTY_ROWS;
  return MONTH_HEAD + COLUMN_HEAD + rows * m.rowH;
}

type GridRow = { year: string | null; months: string[] };

function gridRows(months: string[]): GridRow[] {
  const rows: GridRow[] = [];
  let year = "";
  for (const month of months) {
    const last = rows.at(-1);
    if (month.slice(0, 4) !== year) {
      year = month.slice(0, 4);
      rows.push({ year, months: [month] });
    } else if (last && last.months.length < COLUMNS) {
      last.months.push(month);
    } else {
      rows.push({ year: null, months: [month] });
    }
  }
  return rows;
}

function gridHeight(
  rows: GridRow[],
  byMonth: Map<string, PickupDay[]>,
  m: Metrics,
): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.year ? YEAR_HEAD : 0) +
      Math.max(...row.months.map((key) => tableHeight(byMonth.get(key), m))) +
      ROW_GAP,
    0,
  );
}

function label(pickups: Pickup[]): string {
  return pickups.map((p) => p.label).join(", ");
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
  const tag = (
    parent: PDFKit.PDFStructureElement,
    type: string,
    draw: () => void,
  ) => parent.add(doc.struct(type, {}, draw));

  // Header band, full width, Latarnia navy with an amber edge.
  const logoW = 150;
  const bandTextW = CONTENT_W - logoW - 16;
  const kicker = `Harmonogram odbioru odpadów · ${period}`;
  const dayLine = weekday ? `Twój dzień odbioru: ${weekday}` : null;
  doc.font("regular").fontSize(11);
  let bandH = 22 + doc.heightOfString(kicker, { width: bandTextW }) + 4;
  doc.font("bold").fontSize(26);
  bandH += doc.heightOfString(place.label, { width: bandTextW });
  if (dayLine) {
    doc.fontSize(19);
    bandH += 6 + doc.heightOfString(dayLine, { width: bandTextW });
  }
  bandH = Math.max(bandH + 18, 104);
  artifact(doc, () => {
    doc.rect(0, 0, PAGE_W, bandH).fillColor(NAVY).fill();
    doc
      .rect(0, bandH - 4, PAGE_W, 4)
      .fillColor(AMBER)
      .fill();
  });
  tag(root, "P", () => {
    doc
      .font("regular")
      .fontSize(11)
      .fillColor(WHITE)
      .text(kicker, MARGIN, 22, { width: bandTextW });
  });
  tag(root, "H1", () => {
    doc
      .font("bold")
      .fontSize(26)
      .fillColor(WHITE)
      .text(place.label, MARGIN, doc.y + 4, { width: bandTextW });
  });
  if (dayLine) {
    tag(root, "P", () => {
      doc
        .font("bold")
        .fontSize(19)
        .fillColor(AMBER)
        .text(dayLine, MARGIN, doc.y + 6, { width: bandTextW });
    });
  }

  // Our wordmark where Wigan has its crest: the lantern from the site header.
  const lx = PAGE_W - MARGIN - logoW;
  artifact(doc, () => {
    doc
      .save()
      .translate(lx + 6, 24)
      .scale(1.6);
    doc.roundedRect(0, 0, 14, 20, 1).fillColor(AMBER).fill();
    doc
      .moveTo(7, 0)
      .lineTo(7, 20)
      .moveTo(0, 9)
      .lineTo(14, 9)
      .lineWidth(1.5)
      .strokeColor(NAVY)
      .stroke();
    doc.restore();
    doc
      .font("bold")
      .fontSize(22)
      .fillColor(WHITE)
      .text("conaulicy", lx + 38, 24, { width: logoW - 38, lineBreak: false });
  });
  tag(root, "P", () => {
    doc
      .font("regular")
      .fontSize(11)
      .fillColor(AMBER)
      .text("conaulicy.pl", lx + 38, 52, {
        width: logoW - 38,
        link: SITE_URL,
        lineBreak: false,
      });
  });

  // Info strip: only facts we have. The background is drawn first, with a
  // height measured up front.
  const putOutBy = inWindow
    .flatMap((day) => day.pickups)
    .find((p) => p.putOutBy)?.putOutBy;
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
  const qrSize = 58;
  const qrTextW = 120;
  const noteX = MARGIN + 50;
  const noteW = CONTENT_W - 50 - qrSize - qrTextW - 30;
  const noteH = notes.map((note) => {
    doc.font("regular").fontSize(11);
    return Math.max(
      doc.heightOfString(note.bold + note.text, { width: noteW }),
      28,
    );
  });
  const stripTop = bandH + 12;
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
    tag(root, "P", () => {
      doc
        .font("bold")
        .fontSize(11)
        .fillColor(TEXT)
        .text(note.bold, noteX, top + 2, { width: noteW, continued: true })
        .font("regular")
        .text(note.text);
    });
    y = top + noteH[i] + 8;
  });
  const qrX = PAGE_W - MARGIN - 10 - qrSize;
  const qrTop = stripTop + (stripH - qrSize) / 2;
  artifact(doc, () => drawQr(doc, url, qrX, qrTop, qrSize));
  tag(root, "P", () => {
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
  });
  y = stripTop + stripH + 12;

  // Legend and footer heights, so the grid can be fitted above them.
  const legend = new Map<string, Pickup>();
  for (const pickup of inWindow.flatMap((day) => day.pickups)) {
    if (!legend.has(pickup.subtype)) legend.set(pickup.subtype, pickup);
  }
  const footerLines = place.sources.map((source) => {
    const checked = source.checkedAt
      ? ` · Stan na ${longDate(source.checkedAt)}`
      : "";
    return { text: `Źródło: ${source.label}${checked}`, url: source.url };
  });
  doc.font("regular").fontSize(9);
  let footerH = 0;
  for (const line of footerLines) {
    footerH += doc.heightOfString(line.text, { width: CONTENT_W });
    if (line.url) footerH += doc.heightOfString(line.url, { width: CONTENT_W });
  }
  doc.font("bold").fontSize(9.5);
  const closing = "Serwis nieoficjalny – obowiązuje harmonogram gminy.";
  footerH += doc.heightOfString(closing, { width: CONTENT_W }) + 4;
  // Key entries wrap onto more lines when they do not fit one.
  const keyBin = 20;
  const keyLine = 26;
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
  const legendH = 30 + keyRow * keyLine;
  const footerTop = PAGE_H - MARGIN - footerH;
  const legendTop = footerTop - 10 - legendH;

  // Month grid: the roomiest scale that still fits the page.
  const rows = gridRows(months);
  const maxBins = Math.max(
    1,
    ...inWindow.map((day) =>
      day.pickups.reduce((n, p) => n + tones(p.subtype).length, 0),
    ),
  );
  doc.font("bold").fontSize(1);
  const labelEm = Math.max(
    ...inWindow.map((day) =>
      doc.widthOfString(dayText(day.date, weekday !== null)),
    ),
  );
  const available = legendTop - 8 - y;
  const scale =
    [
      1.5, 1.45, 1.4, 1.35, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85,
      0.8,
    ].find(
      (k) =>
        gridHeight(rows, byMonth, metrics(k, maxBins, labelEm)) <= available,
    ) ?? 0.8;
  const m = metrics(scale, maxBins, labelEm);

  let yearSect: PDFKit.PDFStructureElement | null = null;
  for (const row of rows) {
    if (row.year) {
      yearSect?.end();
      const section = doc.struct("Sect");
      root.add(section);
      yearSect = section;
      const yearText = row.year;
      const top = y;
      tag(section, "H2", () => {
        doc
          .font("bold")
          .fontSize(15)
          .fillColor(TEXT)
          .text(yearText, MARGIN, top, { lineBreak: false });
      });
      y += YEAR_HEAD;
    }
    const rowH = Math.max(
      ...row.months.map((key) => tableHeight(byMonth.get(key), m)),
    );
    const parent = yearSect ?? root;
    row.months.forEach((key, column) => {
      drawMonth(doc, parent, {
        key,
        days: byMonth.get(key),
        x: MARGIN + column * (TABLE_W + COLUMN_GAP),
        y,
        m,
        sameWeekday: weekday !== null,
      });
    });
    y += rowH + ROW_GAP;
  }
  yearSect?.end();

  // Key, like Wigan's: one bin per entry, names at 11pt.
  artifact(doc, () => {
    doc
      .moveTo(MARGIN, legendTop - 4)
      .lineTo(PAGE_W - MARGIN, legendTop - 4)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
  });
  tag(root, "H2", () => {
    doc
      .font("bold")
      .fontSize(12)
      .fillColor(TEXT)
      .text("Oznaczenia", MARGIN, legendTop + 8, { lineBreak: false });
  });
  const keyList = doc.struct("L");
  root.add(keyList);
  for (const item of keyPlaced) {
    const top = legendTop + item.row * keyLine;
    artifact(doc, () => {
      if (item.bins.length === 0) {
        doc
          .rect(item.x, top + 7, 18, 14)
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
    });
    tag(keyList, "LI", () => {
      doc
        .font("regular")
        .fontSize(11)
        .fillColor(TEXT)
        .text(item.label, item.x + item.markW, top + 9, { lineBreak: false });
    });
  }
  keyList.end();

  // Footer: every source with its link and last-checked date.
  let fy = footerTop;
  for (const line of footerLines) {
    const top = fy;
    tag(root, "P", () => {
      doc
        .font("regular")
        .fontSize(9)
        .fillColor(MUTED)
        .text(line.text, MARGIN, top, { width: CONTENT_W });
      if (line.url) {
        doc.text(line.url, { width: CONTENT_W, link: line.url });
      }
    });
    fy = doc.y;
  }
  const closingTop = fy + 4;
  tag(root, "P", () => {
    doc
      .font("bold")
      .fontSize(9.5)
      .fillColor(TEXT)
      .text(closing, MARGIN, closingTop, { width: CONTENT_W });
  });

  root.end();
  doc.end();
  return done;
}

type MonthTable = {
  key: string;
  days: PickupDay[] | undefined;
  x: number;
  y: number;
  m: Metrics;
  sameWeekday: boolean;
};

function drawMonth(
  doc: PDFKit.PDFDocument,
  parent: PDFKit.PDFStructureElement,
  { key, days, x, y, m, sameWeekday }: MonthTable,
) {
  const height = tableHeight(days, m);
  const name = monthTitle(`${key}-01`).replace(/ \d{4}$/, "");

  // Frame, header shading and rules.
  artifact(doc, () => {
    doc.rect(x, y, TABLE_W, MONTH_HEAD).fillColor(SECONDARY).fill();
    if (!days) {
      doc
        .rect(x, y + MONTH_HEAD, TABLE_W, height - MONTH_HEAD)
        .fillColor(SURFACE_2)
        .fill();
    }
    doc.rect(x, y, TABLE_W, height).lineWidth(0.75).strokeColor(RULE).stroke();
    doc
      .moveTo(x, y + MONTH_HEAD)
      .lineTo(x + TABLE_W, y + MONTH_HEAD)
      .moveTo(x, y + MONTH_HEAD + COLUMN_HEAD)
      .lineTo(x + TABLE_W, y + MONTH_HEAD + COLUMN_HEAD)
      .lineWidth(0.5)
      .stroke();
    if (days) {
      doc
        .moveTo(x + m.dayCol, y + MONTH_HEAD)
        .lineTo(x + m.dayCol, y + height)
        .stroke();
      for (let i = 1; i < days.length; i++) {
        const ry = y + MONTH_HEAD + COLUMN_HEAD + i * m.rowH;
        doc
          .moveTo(x, ry)
          .lineTo(x + TABLE_W, ry)
          .lineWidth(0.4)
          .stroke();
      }
    }
  });

  parent.add(
    doc.struct("H3", {}, () => {
      doc
        .font("bold")
        .fontSize(12)
        .fillColor(days ? TEXT : MUTED)
        .text(name, x + 6, y + 3.5, { width: TABLE_W - 12, lineBreak: false });
    }),
  );

  const table = doc.struct("Table");
  parent.add(table);
  const head = doc.struct("TR");
  table.add(head);
  const headY = y + MONTH_HEAD + 2.5;
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
      doc.text("Odbiór", x + m.dayCol + 6, headY, { lineBreak: false });
    }),
  );

  const bodyTop = y + MONTH_HEAD + COLUMN_HEAD;
  if (!days) {
    const tr = doc.struct("TR");
    table.add(tr);
    tr.add(
      doc.struct("TD", {}, () => {
        doc
          .font("regular")
          .fontSize(11)
          .fillColor(MUTED)
          .text("Terminy jeszcze nieogłoszone", x + 6, bodyTop + 5, {
            width: TABLE_W - 12,
          });
      }),
    );
    table.end();
    return;
  }

  days.forEach((day, i) => {
    const top = bodyTop + i * m.rowH;
    const moved = day.pickups.find((p) => p.shiftedFrom)?.shiftedFrom;
    if (moved) {
      artifact(doc, () => {
        doc
          .rect(x + 0.4, top + 0.4, m.dayCol - 0.8, m.rowH - 0.8)
          .fillColor(DANGER)
          .fill();
      });
    }
    const tr = doc.struct("TR");
    table.add(tr);
    const spoken = moved
      ? `${absoluteDay(day.date)} (termin przesunięty z ${absoluteDay(moved)})`
      : absoluteDay(day.date);
    tr.add(
      doc.struct("TD", { actual: spoken }, () => {
        doc
          .font("bold")
          .fontSize(m.date)
          .fillColor(moved ? WHITE : TEXT)
          .text(
            dayText(day.date, sameWeekday),
            x + 6,
            top + (m.rowH - m.date * 1.2) / 2,
            {
              width: m.dayCol - 8,
              lineBreak: false,
            },
          );
      }),
    );
    const bins = day.pickups.flatMap((p) => tones(p.subtype));
    tr.add(
      doc.struct("TD", { actual: label(day.pickups) }, () => {
        bins.forEach((tone, j) => {
          drawBin(
            doc,
            tone,
            x + m.dayCol + 5 + j * (binWidth(m.binH) + BIN_GAP),
            top + (m.rowH - m.binH) / 2,
            m.binH,
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
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const place = getPlace(id);
  if (!place || place.days.length === 0) {
    return new Response("Nie mamy harmonogramu dla tego adresu.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": cacheControl("public, s-maxage=3600"),
      },
    });
  }

  const pdf = await render(place, `${SITE_URL}/adres/${place.id}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="harmonogram-${slug(place.label)}.pdf"`,
      "Cache-Control": cacheControl(
        "public, s-maxage=86400, stale-while-revalidate=86400",
      ),
    },
  });
}
