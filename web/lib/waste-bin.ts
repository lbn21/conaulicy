// The wheelie-bin icon, shared by the website (SVG) and the printable PDF
// (PDFKit), so both draw the same shape. Coordinates are in a 28 × 40 box.

/** Waste subtype → colour token name (design/tokens.css, --waste-{token}). */
export const TOKEN: Record<string, string> = {
  zmieszane: "zmieszane",
  popiol: "popiol",
  bio: "bio",
  papier: "papier",
  tworzywa: "plastik-metale",
  tworzywa_metale: "plastik-metale",
  szklo: "szklo",
  wielkogabarytowe: "gabaryty",
  elektro: "gabaryty",
  opony: "gabaryty",
  tekstylia: "gabaryty",
};

// Fills that fade into a background in some theme; their outline token carries
// the 3:1 non-text contrast (see design/tokens.md).
export const OUTLINED = new Set(["zmieszane", "plastik-metale"]);

/** Fractions a subtype stands for; one bin is drawn per fraction. */
export function tones(subtype: string): string[] {
  if (subtype === "zmieszane_i_bio") return ["zmieszane", "bio"];
  return [subtype];
}

export const BIN_WIDTH = 28;
export const BIN_HEIGHT = 40;

/** Percent of the fill colour kept when mixing with black for shading. */
export const BIN = {
  handle: { x: 1.5, y: 6, width: 7, height: 3, rx: 1.5, shade: 60 },
  body: "M5.5 12h19l-2.3 22.3a2 2 0 0 1-2 1.7H8.6a2 2 0 0 1-2-1.7z",
  rim: { d: "M5.7 13.5h18.6l.2-1.5h-19z", shade: 78 },
  lid: {
    d: "M4 9.5A2.5 2.5 0 0 1 6.5 7h17A2.5 2.5 0 0 1 26 9.5V12H4z",
    shade: 82,
  },
  foot: { x: 17, y: 35, width: 4, height: 3.5, rx: 1, shade: 60 },
  wheel: { cx: 9, cy: 34.5, r: 4.5, shade: 45 },
  hub: { cx: 9, cy: 34.5, r: 1.6 },
} as const;
