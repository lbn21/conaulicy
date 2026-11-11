// Lucide's icons (as components/icon.tsx draws them on the site) drawn into a
// PDFKit document as vectors: the same 24 × 24 shapes, a 2-unit round stroke,
// no fill. Only the SVG elements Lucide uses are known; any other throws, so
// a new icon cannot vanish from the print unnoticed (lib/sorting-guide.test.ts).
import {
  CalendarDays,
  Car,
  Check,
  Clock,
  Flame,
  type IconNode,
  Info,
  Leaf,
  Milk,
  Newspaper,
  Plug,
  Shirt,
  Sofa,
  Trash2,
  TriangleAlert,
  Wine,
  X,
} from "lucide";

type Attrs = Record<string, string | number | undefined>;

const num = (attrs: Attrs, key: string, fallback = 0): number =>
  attrs[key] === undefined ? fallback : Number(attrs[key]);

const points = (attrs: Attrs): Array<[number, number]> => {
  const values = String(attrs.points ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    out.push([values[i], values[i + 1]]);
  }
  return out;
};

/** The SVG elements drawIcon knows. */
export const ICON_ELEMENTS = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

/** Adds one element's outline to the current path. */
function shape(doc: PDFKit.PDFDocument, tag: string, attrs: Attrs) {
  switch (tag) {
    case "path":
      doc.path(String(attrs.d));
      return;
    case "circle":
      doc.circle(num(attrs, "cx"), num(attrs, "cy"), num(attrs, "r"));
      return;
    case "ellipse":
      doc.ellipse(
        num(attrs, "cx"),
        num(attrs, "cy"),
        num(attrs, "rx"),
        num(attrs, "ry"),
      );
      return;
    case "rect": {
      const [x, y, w, h] = ["x", "y", "width", "height"].map((k) =>
        num(attrs, k),
      );
      const r = num(attrs, "rx", num(attrs, "ry"));
      if (r > 0) doc.roundedRect(x, y, w, h, r);
      else doc.rect(x, y, w, h);
      return;
    }
    case "line":
      doc
        .moveTo(num(attrs, "x1"), num(attrs, "y1"))
        .lineTo(num(attrs, "x2"), num(attrs, "y2"));
      return;
    case "polyline":
    case "polygon": {
      const [first, ...rest] = points(attrs);
      if (!first) return;
      doc.moveTo(...first);
      for (const p of rest) doc.lineTo(...p);
      if (tag === "polygon") doc.closePath();
      return;
    }
    default:
      throw new Error(`drawIcon: unknown SVG element <${tag}>`);
  }
}

/**
 * Draws `icon` with its top-left corner at (x, y), `size` pt square, stroked
 * in `colour`. The stroke scales with the icon, as on the site.
 */
export function drawIcon(
  doc: PDFKit.PDFDocument,
  icon: IconNode,
  x: number,
  y: number,
  size: number,
  colour: string,
) {
  doc
    .save()
    .translate(x, y)
    .scale(size / 24)
    .lineWidth(2)
    .lineCap("round")
    .lineJoin("round")
    .strokeColor(colour);
  for (const [tag, attrs] of icon) {
    shape(doc, tag, attrs as Attrs);
    doc.stroke();
  }
  doc.restore();
}

/** Each bin colour token's icon, on its „Co wrzucać” tile. */
export const FRACTION_ICONS: Record<string, IconNode> = {
  zmieszane: Trash2,
  popiol: Flame,
  bio: Leaf,
  papier: Newspaper,
  "plastik-metale": Milk,
  szklo: Wine,
  gabaryty: Sofa,
  elektro: Plug,
  opony: Car,
  tekstylia: Shirt,
};

/** The PDF's other icons, each beside words that say the same. */
export const PDF_ICONS = {
  yes: Check,
  no: X,
  tip: Info,
  hazard: TriangleAlert,
  unverified: Info,
  putOut: Clock,
  later: CalendarDays,
} satisfies Record<string, IconNode>;
