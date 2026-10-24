// The brand palette: the one place our colours are set (docs/brand.md). It
// replaces GOV.UK's brand-blue group, the one part of GOV.UK's palette other
// sites must not use; the rest of GOV.UK's palette is its own. Everything
// reads it: the Sass, the icons and the share card (generated, not in git, by
// scripts/brand-assets.ts, which next.config.ts runs), theme-color and the
// manifest, the footer plate, the PDF, and the checks.
// scripts/check-palette.mjs fails on a brand hex anywhere else.

export const PRIMARY = "#6d2048";

// GOV.UK's method: the primary mixed with white (tints) or black (shades) at
// GOV.UK's percentages. Mixing #1d70b8 this way gives GOV.UK's blue group
// exactly (lib/palette.test.ts).
const STEPS = {
  "tint-25": ["#ffffff", 25],
  "tint-50": ["#ffffff", 50],
  "tint-80": ["#ffffff", 80],
  "tint-95": ["#ffffff", 95],
  "shade-10": ["#000000", 10],
  "shade-25": ["#000000", 25],
  "shade-50": ["#000000", 50],
} as const;
type GovukStep = "primary" | keyof typeof STEPS;
// Ours, not GOV.UK's, with the same method: the link colour (Jakub's
// decision, task 92): 3.14 : 1 against body text, where shade-10 was 1.65.
const OUR_STEPS = {
  "tint-20": ["#ffffff", 20],
} as const;
export type Step = GovukStep | keyof typeof OUR_STEPS;

const channels = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** Sass's color.mix($with, $base, $weight), rounded to a hex as Sass prints it. */
export function mix(withHex: string, baseHex: string, weight: number): string {
  const a = channels(withHex);
  const b = channels(baseHex);
  return `#${a
    .map((c, i) =>
      Math.round((c * weight + b[i] * (100 - weight)) / 100)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const mixAll = (primary: string, steps: object) =>
  Object.fromEntries(
    Object.entries(steps).map(([step, [withHex, weight]]) => [
      step,
      mix(withHex, primary, weight),
    ]),
  );

/** A group of steps from a primary, as GOV.UK's palette groups. */
export function group(primary: string): Record<GovukStep, string> {
  return { primary, ...mixAll(primary, STEPS) } as Record<GovukStep, string>;
}

// Our group in GOV.UK's steps (docs/brand.md's palette table), and all steps.
export const GROUP = group(PRIMARY);
export const PALETTE = {
  ...GROUP,
  ...mixAll(PRIMARY, OUR_STEPS),
} as Record<Step, string>;

// The step links take: the one line to change for another link colour.
export const LINK_STEP: Step = "tint-20";

// The roles GOV.UK derives from its brand blue, in our steps. Visited links
// have no colour of their own: link-visited is the link colour (Jakub's
// decision), as GOV.UK's links without a visited state.
export const ROLE_STEPS: Record<string, Step> = {
  brand: "primary",
  link: LINK_STEP,
  "link-visited": LINK_STEP,
  "link-hover": "shade-50",
  "template-background": "tint-95",
  "surface-background": "tint-95",
  "surface-border": "tint-50",
};
export const ROLES = Object.fromEntries(
  Object.entries(ROLE_STEPS).map(([role, step]) => [role, PALETTE[step]]),
);

// The header bar: the darkest step (Jakub's decision, task 88), not the
// Generic header's black, as GOV.UK's header takes its brand colour. The
// browser's theme-color and the PDF's band are the same colour.
export const HEADER = PALETTE["shade-50"];
// The "ul." plate on light backgrounds (footer, icons, share card): the
// header's colour. In the header it is GOV.UK white.
export const PLATE = HEADER;

/** The colours above as Sass, for app/_palette.scss. */
export function paletteScss(): string {
  const map = (entries: Record<string, string>) =>
    `(\n${Object.entries(entries)
      .map(([k, v]) => `  "${k}": ${v}`)
      .join(",\n")}\n)`;
  return [
    "// Generated from lib/palette.ts by scripts/brand-assets.ts; not in git,",
    "// do not edit.",
    `$app-palette: ${map(PALETTE)};`,
    `$app-roles: ${map(ROLES)};`,
    `$app-header: ${HEADER};`,
    "",
  ].join("\n");
}
