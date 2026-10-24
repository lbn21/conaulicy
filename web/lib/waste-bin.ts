// The waste fractions and their labels, the website's wheelie-bin icon
// (SVG), and the fraction → colour token map the printable PDF shares for
// its shape marks. Coordinates are in a 28 × 40 box.

/** Every waste fraction, in display order, with its label. */
export const FRACTIONS: ReadonlyArray<{ subtype: string; label: string }> = [
  { subtype: "zmieszane", label: "Zmieszane" },
  { subtype: "zmieszane_i_bio", label: "Zmieszane i bio" },
  { subtype: "popiol", label: "Popiół" },
  { subtype: "bio", label: "Bio" },
  { subtype: "papier", label: "Papier" },
  { subtype: "tworzywa", label: "Tworzywa sztuczne" },
  { subtype: "tworzywa_metale", label: "Tworzywa sztuczne i metale" },
  { subtype: "szklo", label: "Szkło" },
  { subtype: "wielkogabarytowe", label: "Wielkogabarytowe" },
  { subtype: "elektro", label: "Elektryczne i elektroniczne" },
  { subtype: "opony", label: "Zużyte opony" },
  { subtype: "tekstylia", label: "Odzież i tekstylia" },
];

/** Waste subtype → colour token name (lib/waste-colours.ts, --waste-{token}). */
export const TOKEN: Record<string, string> = {
  zmieszane: "zmieszane",
  popiol: "popiol",
  bio: "bio",
  papier: "papier",
  tworzywa: "plastik-metale",
  tworzywa_metale: "plastik-metale",
  szklo: "szklo",
  wielkogabarytowe: "gabaryty",
  elektro: "elektro",
  opony: "opony",
  tekstylia: "tekstylia",
};

// Fills that fade into a background in some theme; their outline token carries
// the 3:1 non-text contrast (see design/tokens.md).
export const OUTLINED = new Set([
  "zmieszane",
  "plastik-metale",
  "elektro",
  "opony",
]);

/** Fractions a subtype stands for; one bin is drawn per fraction. */
export function tones(subtype: string): string[] {
  if (subtype === "zmieszane_i_bio") return ["zmieszane", "bio"];
  return [subtype];
}

export const BIN_WIDTH = 28;
export const BIN_HEIGHT = 40;

// The ink (handle top to wheel bottom, handle left to lid right) is centred in
// the viewBox: 3.5 above and below, 1.75 either side, so `vertical-align:
// middle` centres the drawing, not just its box.

/** Percent of the fill colour kept when mixing with black for shading. */
export const BIN = {
  handle: { x: 1.75, y: 3.5, width: 7, height: 3, rx: 1.5, shade: 60 },
  body: "M5.75 9.5h19l-2.3 22.3a2 2 0 0 1-2 1.7H8.85a2 2 0 0 1-2-1.7z",
  rim: { d: "M5.95 11h18.6l.2-1.5h-19z", shade: 78 },
  lid: {
    d: "M4.25 7A2.5 2.5 0 0 1 6.75 4.5h17A2.5 2.5 0 0 1 26.25 7V9.5H4.25z",
    shade: 82,
  },
  foot: { x: 17.25, y: 32.5, width: 4, height: 3.5, rx: 1, shade: 60 },
  wheel: { cx: 9.25, cy: 32, r: 4.5, shade: 45 },
  hub: { cx: 9.25, cy: 32, r: 1.6 },
} as const;
