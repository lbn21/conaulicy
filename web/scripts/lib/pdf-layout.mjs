// The drawn layout of a PDF's pages, for check-pdf's structural checks:
// every stroked rectangle (the month tables, the guide's tiles and boxes)
// and every stroked horizontal rule, in points from the page's top left,
// read from each page's own content stream under its transformation
// matrix; and every word's box, from pdftotext -bbox. Words only by their
// place, never their wording (CLAUDE.md, Workflow).
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";

/** Each object's dictionary and, if it has one, its inflated stream. */
function objects(bytes) {
  const raw = bytes.toString("latin1");
  const found = new Map();
  for (const m of raw.matchAll(/(\d+) 0 obj\b/g)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endobj", start);
    const body = raw.slice(start, end);
    const at = body.search(/stream\r?\n/);
    let stream = null;
    if (at >= 0) {
      const from = start + at + body.slice(at).match(/stream\r?\n/)[0].length;
      const to = raw.indexOf("endstream", from);
      const data = bytes.subarray(from, to);
      try {
        stream = /\/FlateDecode/.test(body.slice(0, at))
          ? inflateSync(data).toString("latin1")
          : data.toString("latin1");
      } catch {
        stream = null;
      }
    }
    found.set(Number(m[1]), {
      dict: at >= 0 ? body.slice(0, at) : body,
      stream,
    });
  }
  return found;
}

/** The pages' content streams, in page order (the page tree's Kids). */
function pageStreams(bytes) {
  const objs = objects(bytes);
  const refs = (text) =>
    [...(text ?? "").matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const root = [...objs.values()].find(
    (o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict),
  );
  const pages = [];
  const visit = (o) => {
    if (/\/Type\s*\/Pages\b/.test(o.dict)) {
      for (const kid of refs(o.dict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1])) {
        visit(objs.get(kid));
      }
      return;
    }
    const contents = o.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1];
    pages.push(
      refs(contents)
        .map((n) => objs.get(n)?.stream ?? "")
        .join("\n"),
    );
  };
  if (root) visit(root);
  return pages;
}

const multiply = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/**
 * A page's stroked rectangles and horizontal and vertical rules, in points from the top
 * left of a page pageH tall. Text and marked content are skipped; fills
 * are not strokes.
 */
function strokes(stream, pageH) {
  const rects = [];
  const rules = [];
  const columns = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let path = [];
  let point = null;
  const operands = [];
  // Strings and arrays carry no path operators: drop them first.
  const tokens = stream
    .replace(/\((?:\\.|[^\\)])*\)/g, " ")
    .replace(/<[0-9A-Fa-f\s]*>/g, " ")
    .split(/[\s[\]]+/)
    .filter(Boolean);
  const top = (x, y) => {
    const [px, py] = apply(ctm, x, y);
    return [px, pageH - py];
  };
  for (const token of tokens) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(token)) {
      operands.push(Number(token));
      continue;
    }
    const n = operands.splice(0);
    switch (token) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        break;
      case "cm":
        ctm = multiply(n.slice(-6), ctm);
        break;
      case "re": {
        const [x, y, w, h] = n.slice(-4);
        const corners = [top(x, y), top(x + w, y + h)];
        path.push({
          kind: "rect",
          x0: Math.min(corners[0][0], corners[1][0]),
          x1: Math.max(corners[0][0], corners[1][0]),
          y0: Math.min(corners[0][1], corners[1][1]),
          y1: Math.max(corners[0][1], corners[1][1]),
        });
        break;
      }
      case "m":
        point = top(...n.slice(-2));
        break;
      case "l": {
        const next = top(...n.slice(-2));
        if (point) path.push({ kind: "line", from: point, to: next });
        point = next;
        break;
      }
      case "S":
      case "s":
        for (const part of path) {
          if (part.kind === "rect") rects.push(part);
          else if (Math.abs(part.from[1] - part.to[1]) < 0.01) {
            rules.push({
              y: part.from[1],
              x0: Math.min(part.from[0], part.to[0]),
              x1: Math.max(part.from[0], part.to[0]),
            });
          } else if (Math.abs(part.from[0] - part.to[0]) < 0.01) {
            columns.push({
              x: part.from[0],
              y0: Math.min(part.from[1], part.to[1]),
              y1: Math.max(part.from[1], part.to[1]),
            });
          }
        }
        path = [];
        break;
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "n":
        path = [];
        break;
      default:
        break;
    }
  }
  return { rects, rules, columns };
}

/** Each page's stroked rectangles and horizontal and vertical rules. */
export function pageStrokes(bytes, pageH) {
  return pageStreams(bytes).map((stream) => strokes(stream, pageH));
}

/** A page's words' boxes (pdftotext -bbox), in points from the top left. */
export function pageWords(file, n) {
  const html = execFileSync(
    "pdftotext",
    ["-bbox", "-f", String(n), "-l", String(n), file, "-"],
    { encoding: "utf8" },
  );
  return [
    ...html.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g,
    ),
  ].map((m) => {
    const [x0, y0, x1, y1] = m.slice(1, 5).map(Number);
    return { x0, y0, x1, y1 };
  });
}

/**
 * Words that spill out of the box they belong to (the one holding their
 * centre) or into a box from outside, by more than `tolerance` points.
 */
export function spills(words, boxes, tolerance) {
  const inside = (word, box) =>
    word.x0 >= box.x0 - tolerance &&
    word.x1 <= box.x1 + tolerance &&
    word.y0 >= box.y0 - tolerance &&
    word.y1 <= box.y1 + tolerance;
  const overlap = (word, box) =>
    Math.min(word.x1, box.x1) - Math.max(word.x0, box.x0) > tolerance &&
    Math.min(word.y1, box.y1) - Math.max(word.y0, box.y0) > tolerance;
  return words.filter((word) => {
    const cx = (word.x0 + word.x1) / 2;
    const cy = (word.y0 + word.y1) / 2;
    const home = boxes.filter(
      (b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1,
    );
    if (home.length) return !home.every((box) => inside(word, box));
    return boxes.some((box) => overlap(word, box));
  });
}
