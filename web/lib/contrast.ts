// WCAG 2.x contrast between two opaque hex colours, as design/contrast.mjs
// computes it, for what the PDF draws on a colour of the data's choosing
// (a fraction's tile header): the ink is picked, never assumed.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(Number.parseInt(hex.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two "#rrggbb" colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Of the inks given, the one with the most contrast on `background`. */
export function readableInk(background: string, inks: string[]): string {
  return inks.reduce((best, ink) =>
    contrastRatio(ink, background) > contrastRatio(best, background)
      ? ink
      : best,
  );
}
