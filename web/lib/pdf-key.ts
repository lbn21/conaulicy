// The PDF key's layout („Oznaczenia”, app/adres/[id]/harmonogram.pdf): one
// fixed grid, the same on every address's PDF, sized from the data alone:
// the fullest key any zone shows in any window of PDF_MONTHS months
// (windowKeys), never one address's own. Its heading on a line of its own,
// then equal cells across the content width, as many columns as the widest
// name allows, as many rows as the fullest key needs. An address fills the
// cells in KEY_ORDER, row by row, and leaves the rest empty.

/** Page 1's months: the current one and the five after it. */
export const PDF_MONTHS = 6;

/** The key's fixed order (Tech Lead, t334); any fraction it lacks, after. */
export const KEY_ORDER: readonly string[] = [
  "zmieszane",
  "papier",
  "tworzywa_metale",
  "tworzywa",
  "szklo",
  "bio",
  "popiol",
  "wielkogabarytowe",
  "elektro",
  "opony",
  "tekstylia",
];

/** These fractions in the key's order. */
export function keyOrder(tones: Iterable<string>): string[] {
  const rank = (tone: string) =>
    KEY_ORDER.includes(tone) ? KEY_ORDER.indexOf(tone) : KEY_ORDER.length;
  return [...new Set(tones)].sort((a, b) => rank(a) - rank(b));
}

const monthIndex = (key: string) =>
  Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

/**
 * Every zone's key in every window of `span` months (from each month it has
 * dates): per zone, its months ("YYYY-MM") and their fractions.
 */
export function windowKeys(
  zones: Iterable<Map<string, Iterable<string>>>,
  span = PDF_MONTHS,
): string[][] {
  const keys: string[][] = [];
  for (const months of zones) {
    const entries = [...months].map(
      ([key, tones]) => [monthIndex(key), [...tones]] as const,
    );
    for (const [start] of entries) {
      keys.push(
        keyOrder(
          entries
            .filter(([m]) => m >= start && m < start + span)
            .flatMap(([, tones]) => tones),
        ),
      );
    }
  }
  return keys;
}

export type KeyGrid = {
  columns: number;
  rows: number;
  /** Every cell's width. */
  cellW: number;
  /** Each column's left edge, from the content's. */
  x: number[];
};

/**
 * The grid for every address: the most equal columns across `room` (`gap`
 * between them) whose cells hold `widest`, and the rows `most` items need.
 */
export function keyGrid(
  room: number,
  gap: number,
  widest: number,
  most: number,
): KeyGrid {
  const cellOf = (n: number) => (room - (n - 1) * gap) / n;
  let columns = 1;
  while (cellOf(columns + 1) >= widest && columns + 1 <= Math.max(1, most)) {
    columns++;
  }
  const cellW = cellOf(columns);
  return {
    columns,
    rows: Math.max(1, Math.ceil(most / columns)),
    cellW,
    x: Array.from({ length: columns }, (_, c) => c * (cellW + gap)),
  };
}

/** The i-th item's cell: row by row, left to right. */
export function keyCell(grid: KeyGrid, i: number) {
  return { row: Math.floor(i / grid.columns), x: grid.x[i % grid.columns] };
}
