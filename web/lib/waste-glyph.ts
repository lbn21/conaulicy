// Print-only glyphs drawn on the bin body in the PDF (kept apart from
// lib/waste-bin.ts, which the client bundle imports).

export type Glyph =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "star"
  | "cross"
  | "plus";

/** Print glyph on the bin body, so fractions differ in black-and-white too. */
export const GLYPH: Record<string, Glyph> = {
  zmieszane: "circle",
  papier: "square",
  "plastik-metale": "triangle",
  szklo: "diamond",
  bio: "star",
  popiol: "cross",
  gabaryty: "plus",
};

/** Centre and half-size of the glyph, inside the body. */
export const GLYPH_BOX = { cx: 14.6, cy: 24, half: 6.5 };
