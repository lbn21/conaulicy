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

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Points along an SVG path's outline (curves and arcs sampled). */
function pathPoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const number = () => {
    skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(d.slice(i));
    if (!m) throw new Error(`pathPoints: bad number at ${i} in ${d}`);
    i += m[0].length;
    return Number(m[0]);
  };
  // Arc flags are one digit each, often packed ("01").
  const flag = () => {
    skip();
    return d[i++] === "1";
  };
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let command = "";
  const sample = (f: (t: number) => [number, number]) => {
    for (let k = 1; k <= 16; k++) out.push(f(k / 16));
  };
  while (true) {
    skip();
    if (i >= d.length) break;
    if (/[a-z]/i.test(d[i])) command = d[i++];
    const rel = command === command.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (command.toUpperCase()) {
      case "M":
        x = ox + number();
        y = oy + number();
        [sx, sy] = [x, y];
        out.push([x, y]);
        command = rel ? "l" : "L";
        break;
      case "L":
        x = ox + number();
        y = oy + number();
        out.push([x, y]);
        break;
      case "H":
        x = ox + number();
        out.push([x, y]);
        break;
      case "V":
        y = oy + number();
        out.push([x, y]);
        break;
      case "C":
      case "S":
      case "Q":
      case "T": {
        const n = { C: 3, S: 2, Q: 2, T: 1 }[command.toUpperCase()] ?? 1;
        const pts: Array<[number, number]> = [[x, y]];
        for (let k = 0; k < n; k++) pts.push([ox + number(), oy + number()]);
        // Control points bound the curve: their hull is enough here.
        out.push(...pts.slice(1));
        [x, y] = pts[pts.length - 1];
        break;
      }
      case "A": {
        const rx = Math.abs(number());
        const ry = Math.abs(number());
        const phi = (number() * Math.PI) / 180;
        const large = flag();
        const sweep = flag();
        const x2 = ox + number();
        const y2 = oy + number();
        out.push(...arcPoints(x, y, rx, ry, phi, large, sweep, x2, y2, sample));
        [x, y] = [x2, y2];
        break;
      }
      case "Z":
        [x, y] = [sx, sy];
        break;
      default:
        throw new Error(`pathPoints: unknown command ${command}`);
    }
  }
  return out;
}

/** An SVG arc's points (endpoint to centre parameterisation, sampled). */
function arcPoints(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phi: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
  sample: (f: (t: number) => [number, number]) => void,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const scale = xp ** 2 / rx ** 2 + yp ** 2 / ry ** 2;
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const num = rx ** 2 * ry ** 2 - rx ** 2 * yp ** 2 - ry ** 2 * xp ** 2;
  const den = rx ** 2 * yp ** 2 + ry ** 2 * xp ** 2;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle(
    (xp - cxp) / rx,
    (yp - cyp) / ry,
    (-xp - cxp) / rx,
    (-yp - cyp) / ry,
  );
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  sample((t) => {
    const a = t1 + dt * t;
    const p: [number, number] = [
      cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin,
      cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos,
    ];
    pts.push(p);
    return p;
  });
  return pts;
}

/**
 * Where an icon's ink lies in its 24 × 24 box, the 2-unit stroke included:
 * what centring it optically needs.
 */
function inkBox(icon: IconNode): Box {
  const pts: Array<[number, number]> = [];
  for (const [tag, raw] of icon) {
    const attrs = raw as Attrs;
    if (tag === "path") pts.push(...pathPoints(String(attrs.d)));
    else if (tag === "circle" || tag === "ellipse") {
      const rx = num(attrs, tag === "circle" ? "r" : "rx");
      const ry = num(attrs, tag === "circle" ? "r" : "ry");
      pts.push(
        [num(attrs, "cx") - rx, num(attrs, "cy") - ry],
        [num(attrs, "cx") + rx, num(attrs, "cy") + ry],
      );
    } else if (tag === "rect") {
      pts.push(
        [num(attrs, "x"), num(attrs, "y")],
        [
          num(attrs, "x") + num(attrs, "width"),
          num(attrs, "y") + num(attrs, "height"),
        ],
      );
    } else if (tag === "line") {
      pts.push(
        [num(attrs, "x1"), num(attrs, "y1")],
        [num(attrs, "x2"), num(attrs, "y2")],
      );
    } else if (tag === "polyline" || tag === "polygon")
      pts.push(...points(attrs));
    else throw new Error(`inkBox: unknown SVG element <${tag}>`);
  }
  const xs = pts.map(([px]) => px);
  const ys = pts.map(([, py]) => py);
  return {
    x0: Math.min(...xs) - 1,
    y0: Math.min(...ys) - 1,
    x1: Math.max(...xs) + 1,
    y1: Math.max(...ys) + 1,
  };
}

/**
 * Draws `icon` in a `size` pt square box at (x, y), stroked in `colour`, its
 * ink centred in the box (Lucide's glyphs sit off-centre in their 24 × 24
 * grid). The stroke scales with the icon, as on the site.
 */
export function drawIcon(
  doc: PDFKit.PDFDocument,
  icon: IconNode,
  x: number,
  y: number,
  size: number,
  colour: string,
) {
  const box = inkBox(icon);
  const dx = 12 - (box.x0 + box.x1) / 2;
  const dy = 12 - (box.y0 + box.y1) / 2;
  doc
    .save()
    .translate(x, y)
    .scale(size / 24)
    .translate(dx, dy)
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
