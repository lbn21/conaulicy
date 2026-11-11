// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf): its
// items in the fewest lines that fit, a fixed gap between items. On that
// many lines, aligned columns (each as wide as its widest item) if they
// fit, else lines as even as can be; either way never one item alone on a
// line beside fuller ones, unless nothing else fits.

export type KeyGrid = {
  /** Lines the items take. */
  rows: number;
  /** Each item's place, in the items' order (line by line). */
  places: Array<{ row: number; x: number }>;
};

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** A line's width: its items and the gaps between them. */
const lineW = (widths: number[], gap: number) =>
  sum(widths) + Math.max(0, widths.length - 1) * gap;

/** One item alone on a line while another holds more. */
const lone = (counts: number[]) =>
  counts.some((c) => c === 1) && counts.some((c) => c > 1);

/** In `rows` lines filled in turn, columns as wide as their widest item. */
function columns(widths: number[], rows: number, room: number, gap: number) {
  const n = widths.length;
  const cols = Math.ceil(n / rows);
  const counts = Array.from({ length: rows }, (_, r) =>
    Math.max(0, Math.min(cols, n - r * cols)),
  );
  if (counts.some((c) => c === 0) || lone(counts)) return null;
  const colW = Array<number>(cols).fill(0);
  widths.forEach((w, i) => {
    colW[i % cols] = Math.max(colW[i % cols], w);
  });
  if (lineW(colW, gap) > room) return null;
  const colX = colW.map((_, c) => sum(colW.slice(0, c)) + c * gap);
  return widths.map((_, i) => ({
    row: Math.floor(i / cols),
    x: colX[i % cols],
  }));
}

/** Every way to cut n items, in order, into `rows` non-empty lines. */
function* cuts(n: number, rows: number, from = 0): Generator<number[]> {
  if (rows === 1) {
    yield [n - from];
    return;
  }
  for (let take = 1; take <= n - from - (rows - 1); take++) {
    for (const rest of cuts(n, rows - 1, from + take)) yield [take, ...rest];
  }
}

/** In `rows` lines at the items' own widths: the most even cut that fits. */
function lines(widths: number[], rows: number, room: number, gap: number) {
  let best: { counts: number[]; widest: number; lone: boolean } | null = null;
  for (const counts of cuts(widths.length, rows)) {
    let at = 0;
    const ws = counts.map((c) => {
      const w = lineW(widths.slice(at, at + c), gap);
      at += c;
      return w;
    });
    // A line too wide only if it holds more than one item.
    if (counts.some((c, i) => c > 1 && ws[i] > room)) continue;
    const widest = Math.max(...ws);
    const candidate = { counts, widest, lone: lone(counts) };
    if (
      !best ||
      Number(candidate.lone) < Number(best.lone) ||
      (candidate.lone === best.lone && widest < best.widest)
    ) {
      best = candidate;
    }
  }
  if (!best || (best.lone && rows < widths.length)) return null;
  const places: KeyGrid["places"] = [];
  best.counts.forEach((c, row) => {
    let x = 0;
    for (let k = 0; k < c; k++) {
      places.push({ row, x });
      x += widths[places.length - 1] + gap;
    }
  });
  return places;
}

/** Lays out items of these widths in `room` points, `gap` between them. */
export function keyGrid(widths: number[], room: number, gap: number): KeyGrid {
  const n = widths.length;
  if (n === 0) return { rows: 1, places: [] };
  for (let rows = 1; rows < n; rows++) {
    const places =
      columns(widths, rows, room, gap) ?? lines(widths, rows, room, gap);
    if (places) return { rows, places };
  }
  // One item a line: the last resort, whatever the widths.
  return { rows: n, places: widths.map((_, row) => ({ row, x: 0 })) };
}
