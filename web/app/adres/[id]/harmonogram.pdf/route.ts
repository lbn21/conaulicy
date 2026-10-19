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
const QR_SIZE = 71; // 25 mm
const COLUMNS = 3;
const GAP = 14;
const COLUMN_W = (CONTENT_W - GAP * (COLUMNS - 1)) / COLUMNS;
const LINE = 15;
const SHAPE = 10;
const MAX_MONTHS = 12;

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

function drawMark(doc: PDFKit.PDFDocument, mark: Mark, x: number, y: number) {
  const s = SHAPE;
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
    .lineWidth(0.75)
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

function monthHeight(days: PickupDay[]): number {
  const rows = days.reduce((sum, day) => sum + day.pickups.length, 0);
  return 20 + rows * LINE + (days.length - 1) * 4;
}

function render(place: PlaceView, url: string): Promise<Buffer> {
  const title = `Harmonogram odbioru odpadów – ${place.label}`;
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
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

  const root = doc.struct("Document");
  doc.addStructure(root);
  const textW = CONTENT_W - QR_SIZE - 16;

  // Header
  root.add(
    doc.struct("P", {}, () => {
      doc
        .font("regular")
        .fontSize(14)
        .fillColor(MUTED)
        .text("Harmonogram odbioru odpadów", MARGIN, MARGIN, { width: textW });
    }),
  );
  root.add(
    doc.struct("H1", {}, () => {
      doc
        .font("bold")
        .fontSize(26)
        .fillColor(TEXT)
        .text(place.label, { width: textW });
    }),
  );
  root.add(
    doc.struct("P", {}, () => {
      doc
        .font("regular")
        .fontSize(12)
        .text(`${place.gmina} · ${period(place.days)}`, { width: textW });
    }),
  );
  root.add(
    doc.struct("P", {}, () => {
      doc
        .fontSize(10)
        .fillColor(MUTED)
        .text(`Aktualne terminy: ${url}`, { width: textW, link: url });
    }),
  );
  const textBottom = doc.y;

  const qrX = PAGE_W - MARGIN - QR_SIZE;
  artifact(doc, () => drawQr(doc, url, qrX, MARGIN));
  root.add(
    doc.struct("P", {}, () => {
      doc
        .fontSize(9)
        .fillColor(TEXT)
        .text("Zeskanuj – aktualne terminy", qrX - 10, MARGIN + QR_SIZE + 4, {
          width: QR_SIZE + 20,
          align: "center",
        });
    }),
  );

  let y = Math.max(textBottom, doc.y) + 10;
  artifact(doc, () => {
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .lineWidth(1)
      .strokeColor(ACCENT)
      .stroke();
  });
  y += 12;

  const putOutBy = place.days
    .flatMap((day) => day.pickups)
    .find((pickup) => pickup.putOutBy)?.putOutBy;
  if (putOutBy) {
    root.add(
      doc.struct("P", {}, () => {
        doc
          .font("regular")
          .fontSize(11)
          .fillColor(TEXT)
          .text(
            `Wystaw pojemniki do ${putOutBy.replace(/^0/, "")} w dniu odbioru.`,
            MARGIN,
            y,
            { width: CONTENT_W },
          );
      }),
    );
    y = doc.y + 12;
  }

  // Month grid, three columns, in reading order.
  const months = byMonth(place.days);
  for (let start = 0; start < months.length; start += COLUMNS) {
    const row = months.slice(start, start + COLUMNS);
    const rowH = Math.max(...row.map(monthHeight));
    if (y + rowH > PAGE_H - MARGIN - 90) {
      doc.addPage();
      y = MARGIN;
    }
    row.forEach((days, column) => {
      const x = MARGIN + column * (COLUMN_W + GAP);
      const section = doc.struct("Sect");
      root.add(section);
      section.add(
        doc.struct("H2", {}, () => {
          doc
            .font("bold")
            .fontSize(12)
            .fillColor(TEXT)
            .text(monthTitle(days[0].date), x, y, { width: COLUMN_W });
        }),
      );
      const list = doc.struct("L");
      section.add(list);
      let dy = y + 20;
      for (const day of days) {
        const labels = day.pickups.map((p) => p.label.toLowerCase());
        const sentence = `${absoluteDay(day.date)}: ${labels.join(", ")}`;
        const top = dy;
        list.add(
          doc.struct("LI", { actual: sentence }, () => {
            doc
              .font("bold")
              .fontSize(12)
              .fillColor(TEXT)
              .text(
                `${Number(day.date.slice(8))} ${weekdayShort(day.date)}`,
                x,
                top,
                { width: 52, lineBreak: false },
              );
            day.pickups.forEach((pickup, i) => {
              const offset = marksFor(pickup.subtype).length * (SHAPE + 3);
              doc
                .font("regular")
                .fontSize(11)
                .text(pickup.label, x + 54 + offset, top + 1 + i * LINE, {
                  width: COLUMN_W - 54 - offset,
                  lineBreak: false,
                  ellipsis: true,
                });
            });
          }),
        );
        artifact(doc, () => {
          day.pickups.forEach((pickup, i) => {
            marksFor(pickup.subtype).forEach((mark, j) => {
              drawMark(doc, mark, x + 54 + j * (SHAPE + 3), top + 3 + i * LINE);
            });
          });
        });
        dy += day.pickups.length * LINE + 4;
      }
      list.end();
      section.end();
    });
    y += rowH + 14;
  }

  // Legend: one entry per subtype present in the data, in data order.
  const legend = new Map<string, string>();
  for (const pickup of place.days.flatMap((day) => day.pickups)) {
    if (!legend.has(pickup.subtype)) legend.set(pickup.subtype, pickup.label);
  }
  root.add(
    doc.struct("H2", {}, () => {
      doc
        .font("bold")
        .fontSize(11)
        .fillColor(TEXT)
        .text("Oznaczenia", MARGIN, y);
    }),
  );
  y = doc.y + 4;
  let lx = MARGIN;
  const legendList = doc.struct("L");
  root.add(legendList);
  for (const [subtype, label] of legend) {
    const marks = marksFor(subtype);
    const markW = marks.length * (SHAPE + 3);
    doc.font("regular").fontSize(10);
    const itemW = markW + doc.widthOfString(label) + 16;
    if (lx + itemW > PAGE_W - MARGIN) {
      lx = MARGIN;
      y += LINE;
    }
    const ix = lx;
    const iy = y;
    artifact(doc, () => {
      marks.forEach((mark, j) => {
        drawMark(doc, mark, ix + j * (SHAPE + 3), iy + 1);
      });
    });
    legendList.add(
      doc.struct("LI", {}, () => {
        doc.fillColor(TEXT).text(label, ix + markW, iy, { lineBreak: false });
      }),
    );
    lx += itemW;
  }
  legendList.end();
  y += LINE + 14;

  // Footer: every source with its link and last-checked date.
  doc.font("regular").fontSize(9).fillColor(MUTED);
  for (const source of place.sources) {
    const checked = source.checkedAt
      ? ` · Stan na ${longDate(source.checkedAt)}`
      : "";
    root.add(
      doc.struct("P", {}, () => {
        doc.text(`Źródło: ${source.label}${checked}`, MARGIN, y, {
          width: CONTENT_W,
        });
        if (source.url) {
          doc.text(source.url, { width: CONTENT_W, link: source.url });
        }
      }),
    );
    y = doc.y + 4;
  }
  root.add(
    doc.struct("P", {}, () => {
      doc
        .font("bold")
        .fillColor(TEXT)
        .text(
          "Serwis nieoficjalny – obowiązuje harmonogram gminy.",
          MARGIN,
          y,
          {
            width: CONTENT_W,
          },
        );
    }),
  );

  root.end();
  doc.end();
  return done;
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
