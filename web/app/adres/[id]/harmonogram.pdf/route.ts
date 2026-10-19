import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import {
  longDate,
  monthGenitive,
  monthTitle,
  weekdayShort,
} from "@/lib/date-labels";
import { absoluteDay } from "@/lib/dates";
import { cacheControl } from "@/lib/gate";
import {
  getPlace,
  normalize,
  type PickupDay,
  type PlaceView,
} from "@/lib/schedule";

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

// A4 in points, 12 mm margins.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 34;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const QR_SIZE = 85; // 30 mm
const COLUMNS = 2;
const GAP = 24;
const COLUMN_W = (CONTENT_W - GAP * (COLUMNS - 1)) / COLUMNS;
const MAX_MONTHS = 12;

// Type and spacing at scale 1. The page picks the largest scale at which the
// whole season fits on one A4 page (most readable for older readers); a long
// season that fits at no scale uses 1 and continues on more pages.
const BASE = {
  kicker: 15,
  title: 30,
  meta: 15,
  url: 12,
  notice: 15,
  month: 18,
  date: 16,
  label: 15,
  shape: 15,
  line: 21,
  dayGap: 9,
  monthHead: 28,
  rowGap: 18,
  legendHead: 14,
  legendText: 13,
  footer: 10,
};
const SCALES = [1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95];

type Metrics = typeof BASE;

function scaled(k: number): Metrics {
  return Object.fromEntries(
    Object.entries(BASE).map(([key, value]) => [key, value * k]),
  ) as Metrics;
}

// Light-theme tokens from design/tokens.css.
const TEXT = "#161b24";
const MUTED = "#4a5568";
const ACCENT = "#9a5700";

type Shape =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "star"
  | "cross"
  | "plus";

type Mark = { shape: Shape; fill: string; stroke: string };

const BULKY: Mark = { shape: "plus", fill: "#a8336a", stroke: TEXT };
const PLASTICS: Mark = {
  shape: "triangle",
  fill: "#f2c200",
  stroke: "#7d6200",
};

// Colour plus shape, so a black-and-white print still tells fractions apart.
const MARKS: Record<string, Mark> = {
  zmieszane: { shape: "circle", fill: "#111111", stroke: TEXT },
  papier: { shape: "square", fill: "#1f63c7", stroke: TEXT },
  tworzywa: PLASTICS,
  tworzywa_metale: PLASTICS,
  szklo: { shape: "diamond", fill: "#1e7f4f", stroke: TEXT },
  bio: { shape: "star", fill: "#7a4b2a", stroke: TEXT },
  popiol: { shape: "cross", fill: "#5c6370", stroke: TEXT },
  wielkogabarytowe: BULKY,
  elektro: BULKY,
  opony: BULKY,
  tekstylia: BULKY,
};

function marksFor(subtype: string): Mark[] {
  if (subtype === "zmieszane_i_bio") return [MARKS.zmieszane, MARKS.bio];
  const mark = MARKS[subtype];
  return mark ? [mark] : [];
}

function regularPolygon(
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rotation: number,
): Array<[number, number]> {
  const corners = inner > 0 ? points * 2 : points;
  return Array.from({ length: corners }, (_, i) => {
    const r = inner > 0 && i % 2 === 1 ? inner : outer;
    const angle = rotation + (i * 2 * Math.PI) / corners;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

// A plus sign centred on (cx, cy): arms reach `half` from the centre and are
// 2 * `t` thick. `angle` 0 gives +, Math.PI / 4 gives ×.
function plusSign(
  cx: number,
  cy: number,
  half: number,
  t: number,
  angle: number,
): Array<[number, number]> {
  const outline: Array<[number, number]> = [
    [-t, -half],
    [t, -half],
    [t, -t],
    [half, -t],
    [half, t],
    [t, t],
    [t, half],
    [-t, half],
    [-t, t],
    [-half, t],
    [-half, -t],
    [-t, -t],
  ];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map(([px, py]) => [
    cx + px * cos - py * sin,
    cy + px * sin + py * cos,
  ]);
}

function drawMark(
  doc: PDFKit.PDFDocument,
  mark: Mark,
  x: number,
  y: number,
  s: number,
) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const up = -Math.PI / 2;
  doc.save();
  switch (mark.shape) {
    case "circle":
      doc.circle(cx, cy, s / 2);
      break;
    case "square":
      doc.rect(x + 0.5, y + 0.5, s - 1, s - 1);
      break;
    case "triangle":
      doc.polygon([cx, y], [x + s, y + s], [x, y + s]);
      break;
    case "diamond":
      doc.polygon([cx, y], [x + s, cy], [cx, y + s], [x, cy]);
      break;
    case "star":
      doc.polygon(...regularPolygon(cx, cy + 0.5, 5, s / 2 + 0.5, s / 4.4, up));
      break;
    case "cross":
      // Bold ×: the diagonal arms reach the corners of the box.
      doc.polygon(...plusSign(cx, cy, (s / 2) * 1.3, s / 7, Math.PI / 4));
      break;
    case "plus":
      doc.polygon(...plusSign(cx, cy, s / 2, s / 6, 0));
      break;
  }
  doc
    .lineWidth(s / 13)
    .lineJoin("round")
    .fillColor(mark.fill)
    .strokeColor(mark.stroke)
    .fillAndStroke();
  doc.restore();
}

function artifact(doc: PDFKit.PDFDocument, draw: () => void) {
  doc.markContent("Artifact", { type: "Layout" });
  draw();
  doc.endMarkedContent();
}

function drawQr(doc: PDFKit.PDFDocument, url: string, x: number, y: number) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const cell = QR_SIZE / modules.size;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) {
        doc.rect(x + col * cell, y + row * cell, cell + 0.05, cell + 0.05);
      }
    }
  }
  doc.fillColor("#000000").fill();
}

function period(days: PickupDay[]): string {
  const first = days[0].date;
  const last = days[days.length - 1].date;
  if (first.slice(0, 7) === last.slice(0, 7)) return monthTitle(first);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return sameYear
    ? `od ${monthGenitive(first)} do ${monthGenitive(last)} ${last.slice(0, 4)}`
    : `od ${monthGenitive(first)} ${first.slice(0, 4)} do ${monthGenitive(last)} ${last.slice(0, 4)}`;
}

function byMonth(days: PickupDay[]): PickupDay[][] {
  const months = new Map<string, PickupDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), day]);
  }
  return [...months.values()].slice(0, MAX_MONTHS);
}

function monthHeight(days: PickupDay[], m: Metrics): number {
  const rows = days.reduce((sum, day) => sum + day.pickups.length, 0);
  return m.monthHead + rows * m.line + (days.length - 1) * m.dayGap;
}

function dayLabel(iso: string): string {
  return `${Number(iso.slice(8))} ${weekdayShort(iso)}`;
}

// Shapes plus the gap before the label.
function marksWidth(count: number, m: Metrics): number {
  return count * m.shape * 1.25 + m.shape * 0.3;
}

// Line box height PDFKit uses for a font size, close enough for layout.
function lineHeight(size: number): number {
  return size * 1.26;
}

type Line = {
  font: "regular" | "bold";
  size: number;
  color: string;
  text: string;
  struct: "P" | "H1";
  link?: string;
};

type Layout = {
  m: Metrics;
  dateW: number;
  header: Line[];
  notice: string | null;
  /** Height of the title block and QR code, above the accent rule. */
  topH: number;
  headerH: number;
  legend: Array<[string, string]>;
  legendRows: number;
  legendH: number;
  footer: Array<{ text: string; link?: string; bold?: boolean }>;
  footerH: number;
  bottomH: number;
  rows: PickupDay[][][];
  rowHeights: number[];
};

const TEXT_W = CONTENT_W - QR_SIZE - 16;
const CAPTION = "Zeskanuj – aktualne terminy";
const CAPTION_SIZE = 10;

function layout(
  doc: PDFKit.PDFDocument,
  place: PlaceView,
  url: string,
  k: number,
): Layout {
  const m = scaled(k);
  const header: Line[] = [
    {
      font: "regular",
      size: m.kicker,
      color: MUTED,
      text: "Harmonogram odbioru odpadów",
      struct: "P",
    },
    {
      font: "bold",
      size: m.title,
      color: TEXT,
      text: place.label,
      struct: "H1",
    },
    {
      font: "regular",
      size: m.meta,
      color: TEXT,
      text: `${place.gmina} · ${period(place.days)}`,
      struct: "P",
    },
    {
      font: "regular",
      size: m.url,
      color: MUTED,
      text: `Aktualne terminy: ${url}`,
      struct: "P",
      link: url,
    },
  ];
  let textH = 0;
  for (const line of header) {
    doc.font(line.font).fontSize(line.size);
    textH += doc.heightOfString(line.text, { width: TEXT_W });
  }
  doc.font("regular").fontSize(CAPTION_SIZE);
  const qrH =
    QR_SIZE +
    4 +
    doc.heightOfString(CAPTION, { width: QR_SIZE + 24, align: "center" });

  const putOutBy = place.days
    .flatMap((day) => day.pickups)
    .find((pickup) => pickup.putOutBy)?.putOutBy;
  const notice = putOutBy
    ? `Wystaw pojemniki do ${putOutBy.replace(/^0/, "")} w dniu odbioru.`
    : null;
  const topH = Math.max(textH, qrH);
  let headerH = topH + 24;
  if (notice) {
    doc.fontSize(m.notice);
    headerH += doc.heightOfString(notice, { width: CONTENT_W }) + 14;
  }

  doc.font("bold").fontSize(m.date);
  const dateW =
    Math.max(
      ...place.days.map((day) => doc.widthOfString(dayLabel(day.date))),
    ) +
    m.date * 0.6;

  // Legend: one entry per subtype present in the data, in data order.
  const seen = new Map<string, string>();
  for (const pickup of place.days.flatMap((day) => day.pickups)) {
    if (!seen.has(pickup.subtype)) seen.set(pickup.subtype, pickup.label);
  }
  const legend = [...seen.entries()];
  doc.font("regular").fontSize(m.legendText);
  let legendRows = 1;
  let lx = 0;
  for (const [subtype, label] of legend) {
    const w =
      marksWidth(marksFor(subtype).length, m) +
      doc.widthOfString(label) +
      m.legendText * 1.4;
    if (lx > 0 && lx + w > CONTENT_W) {
      legendRows++;
      lx = 0;
    }
    lx += w;
  }
  const legendH = lineHeight(m.legendHead) + 6 + legendRows * m.line;

  // Footer: every source with its link and last-checked date.
  const footer: Layout["footer"] = [];
  for (const source of place.sources) {
    const checked = source.checkedAt
      ? ` · Stan na ${longDate(source.checkedAt)}`
      : "";
    footer.push({ text: `Źródło: ${source.label}${checked}` });
    if (source.url) footer.push({ text: source.url, link: source.url });
  }
  footer.push({
    text: "Serwis nieoficjalny – obowiązuje harmonogram gminy.",
    bold: true,
  });
  let footerH = 0;
  for (const line of footer) {
    doc.font(line.bold ? "bold" : "regular").fontSize(m.footer);
    footerH += doc.heightOfString(line.text, { width: CONTENT_W }) + 2;
  }
  const bottomH = 16 + legendH + 14 + footerH;

  const months = byMonth(place.days);
  const rows: PickupDay[][][] = [];
  for (let i = 0; i < months.length; i += COLUMNS) {
    rows.push(months.slice(i, i + COLUMNS));
  }
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((days) => monthHeight(days, m))),
  );

  return {
    m,
    dateW,
    header,
    notice,
    topH,
    headerH,
    legend,
    legendRows,
    legendH,
    footer,
    footerH,
    bottomH,
    rows,
    rowHeights,
  };
}

function fitsOnePage(doc: PDFKit.PDFDocument, l: Layout): boolean {
  const gridH =
    l.rowHeights.reduce((sum, h) => sum + h, 0) +
    (l.rowHeights.length - 1) * l.m.rowGap;
  if (l.headerH + gridH + l.bottomH > PAGE_H - 2 * MARGIN) return false;
  doc.font("regular").fontSize(l.m.label);
  return l.rows
    .flat(2)
    .every((day) =>
      day.pickups.every(
        (pickup) =>
          l.dateW +
            marksWidth(marksFor(pickup.subtype).length, l.m) +
            doc.widthOfString(pickup.label) <=
          COLUMN_W,
      ),
    );
}

function render(place: PlaceView, url: string): Promise<Buffer> {
  const title = `Harmonogram odbioru odpadów – ${place.label}`;
  const doc = new PDFDocument({
    size: "A4",
    // Layout keeps its own 12 mm margins; a small bottom margin stops PDFKit
    // from adding a page when the footer ends exactly at the margin.
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 8 },
    pdfVersion: "1.7",
    tagged: true,
    // @types/pdfkit lags behind 0.20, which supports PDF/UA.
    subset: "PDF/UA" as PDFKit.Mixins.PDFSubsets,
    lang: "pl-PL",
    displayTitle: true,
    font: REGULAR as unknown as string,
    info: { Title: title, Author: "conaulicy.pl", Subject: place.gmina },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );

  doc.registerFont("regular", REGULAR);
  doc.registerFont("bold", BOLD);

  const onePage = SCALES.map((k) => layout(doc, place, url, k)).find((l) =>
    fitsOnePage(doc, l),
  );
  const l = onePage ?? layout(doc, place, url, 1);
  const { m } = l;

  const root = doc.struct("Document");
  doc.addStructure(root);

  // Header (first page only).
  doc.y = MARGIN;
  for (const line of l.header) {
    root.add(
      doc.struct(line.struct, {}, () => {
        doc
          .font(line.font)
          .fontSize(line.size)
          .fillColor(line.color)
          .text(line.text, MARGIN, doc.y, {
            width: TEXT_W,
            link: line.link,
          });
      }),
    );
  }
  const qrX = PAGE_W - MARGIN - QR_SIZE;
  artifact(doc, () => drawQr(doc, url, qrX, MARGIN));
  root.add(
    doc.struct("P", {}, () => {
      doc
        .font("regular")
        .fontSize(CAPTION_SIZE)
        .fillColor(TEXT)
        .text(CAPTION, qrX - 12, MARGIN + QR_SIZE + 4, {
          width: QR_SIZE + 24,
          align: "center",
        });
    }),
  );
  const ruleY = MARGIN + l.topH + 10;
  artifact(doc, () => {
    doc
      .moveTo(MARGIN, ruleY)
      .lineTo(PAGE_W - MARGIN, ruleY)
      .lineWidth(1.25)
      .strokeColor(ACCENT)
      .stroke();
  });
  const notice = l.notice;
  if (notice) {
    root.add(
      doc.struct("P", {}, () => {
        doc
          .font("regular")
          .fontSize(m.notice)
          .fillColor(TEXT)
          .text(notice, MARGIN, ruleY + 14, { width: CONTENT_W });
      }),
    );
  }
  let y = MARGIN + l.headerH;

  const gridBottom = PAGE_H - MARGIN - l.bottomH;

  // Month grid, two columns, in reading order. A month never splits.
  l.rows.forEach((row, r) => {
    const rowH = l.rowHeights[r];
    if (y + rowH > gridBottom && y > MARGIN + 40) {
      artifact(doc, () => drawBottom(doc, l, null));
      doc.addPage();
      y = drawContinuation(doc, place, m);
    }
    row.forEach((days, column) => {
      drawMonth(doc, root, l, days, MARGIN + column * (COLUMN_W + GAP), y);
    });
    y += rowH + m.rowGap;
  });

  drawBottom(doc, l, root);

  root.end();
  doc.end();
  return done;
}

function drawContinuation(
  doc: PDFKit.PDFDocument,
  place: PlaceView,
  m: Metrics,
): number {
  let y = MARGIN;
  artifact(doc, () => {
    doc
      .font("bold")
      .fontSize(m.meta)
      .fillColor(TEXT)
      .text(`${place.label} – ciąg dalszy`, MARGIN, y, { width: CONTENT_W });
    y = doc.y + 8;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .lineWidth(1.25)
      .strokeColor(ACCENT)
      .stroke();
  });
  return y + 16;
}

function drawMonth(
  doc: PDFKit.PDFDocument,
  root: PDFKit.PDFStructureElement,
  l: Layout,
  days: PickupDay[],
  x: number,
  y: number,
) {
  const { m } = l;
  const section = doc.struct("Sect");
  root.add(section);
  section.add(
    doc.struct("H2", {}, () => {
      doc
        .font("bold")
        .fontSize(m.month)
        .fillColor(TEXT)
        .text(monthTitle(days[0].date), x, y, { width: COLUMN_W });
    }),
  );
  const list = doc.struct("L");
  section.add(list);
  let rowTop = y + m.monthHead;
  for (const day of days) {
    const labels = day.pickups.map((p) => p.label.toLowerCase());
    const sentence = `${absoluteDay(day.date)}: ${labels.join(", ")}`;
    const top = rowTop;
    list.add(
      doc.struct("LI", { actual: sentence }, () => {
        doc
          .font("bold")
          .fontSize(m.date)
          .fillColor(TEXT)
          .text(
            dayLabel(day.date),
            x,
            top + (m.line - lineHeight(m.date)) / 2,
            {
              width: l.dateW,
              lineBreak: false,
            },
          );
        day.pickups.forEach((pickup, i) => {
          const left =
            x + l.dateW + marksWidth(marksFor(pickup.subtype).length, m);
          doc
            .font("regular")
            .fontSize(m.label)
            .text(
              pickup.label,
              left,
              top + i * m.line + (m.line - lineHeight(m.label)) / 2,
              { width: x + COLUMN_W - left, lineBreak: false, ellipsis: true },
            );
        });
      }),
    );
    artifact(doc, () => {
      day.pickups.forEach((pickup, i) => {
        marksFor(pickup.subtype).forEach((mark, j) => {
          drawMark(
            doc,
            mark,
            x + l.dateW + j * m.shape * 1.25,
            top + i * m.line + (m.line - m.shape) / 2,
            m.shape,
          );
        });
      });
    });
    rowTop += day.pickups.length * m.line + m.dayGap;
  }
  list.end();
  section.end();
}

// Legend and footer, pinned to the bottom of the page. Tagged once, on the
// last page; earlier pages repeat them as artifacts (root = null).
function drawBottom(
  doc: PDFKit.PDFDocument,
  l: Layout,
  root: PDFKit.PDFStructureElement | null,
) {
  const { m } = l;
  const tag = (type: string, draw: () => void) => {
    if (root) root.add(doc.struct(type, {}, draw));
    else draw();
  };
  // Marked content cannot nest: when the whole block is already an artifact,
  // draw decoration directly.
  const marks = (draw: () => void) => {
    if (root) artifact(doc, draw);
    else draw();
  };

  let y = PAGE_H - MARGIN - l.bottomH + 16;
  marks(() => {
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(PAGE_W - MARGIN, y - 8)
      .lineWidth(0.5)
      .strokeColor(MUTED)
      .stroke();
  });
  tag("H2", () => {
    doc
      .font("bold")
      .fontSize(m.legendHead)
      .fillColor(TEXT)
      .text("Oznaczenia", MARGIN, y);
  });
  y += lineHeight(m.legendHead) + 6;

  const list = root ? doc.struct("L") : null;
  if (root && list) root.add(list);
  doc.font("regular").fontSize(m.legendText);
  let lx = MARGIN;
  for (const [subtype, label] of l.legend) {
    const count = marksFor(subtype).length;
    const markW = marksWidth(count, m);
    const w = markW + doc.widthOfString(label) + m.legendText * 1.4;
    if (lx > MARGIN && lx + w > PAGE_W - MARGIN) {
      lx = MARGIN;
      y += m.line;
    }
    const ix = lx;
    const iy = y;
    marks(() => {
      marksFor(subtype).forEach((mark, j) => {
        drawMark(
          doc,
          mark,
          ix + j * m.shape * 1.25,
          iy + (m.line - m.shape) / 2,
          m.shape,
        );
      });
    });
    const write = () => {
      doc
        .font("regular")
        .fontSize(m.legendText)
        .fillColor(TEXT)
        .text(label, ix + markW, iy + (m.line - lineHeight(m.legendText)) / 2, {
          lineBreak: false,
        });
    };
    if (list) list.add(doc.struct("LI", {}, write));
    else write();
    lx += w;
  }
  list?.end();

  y = PAGE_H - MARGIN - l.footerH;
  for (const line of l.footer) {
    const top = y;
    tag("P", () => {
      doc
        .font(line.bold ? "bold" : "regular")
        .fontSize(m.footer)
        .fillColor(line.bold ? TEXT : MUTED)
        .text(line.text, MARGIN, top, { width: CONTENT_W, link: line.link });
    });
    y = doc.y + 2;
  }
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
