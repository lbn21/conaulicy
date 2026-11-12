// The brand palette: the one place our colours are set (docs/brand.md). It
// replaces GOV.UK's brand-blue group, the one part of GOV.UK's palette other
// sites must not use; the rest of GOV.UK's palette is its own. Everything
// reads it: the Sass, the icons and the share card (generated, not in git, by
// scripts/brand-assets.ts, which npm runs before dev and build), theme-color
// and the manifest, the footer plate, the PDF, and the checks.
// scripts/check-palette.mjs fails on a brand hex anywhere else.

export const PRIMARY = "#6d2048";

// The one accent (t390, Jakub): a light rose on the home page's hero, for
// the h1's last word, the hero's check icons and the panel's tile edges.
// Only on the hero's dark brand gradient, never on white (it is 1.7 : 1
// there); every other brand colour stays a tint or shade of PRIMARY.
/** @public The palette's one accent, for docs/brand.md and the checks. */
export const ACCENT = "#f5b3cb";

const WHITE = "#ffffff";
const BLACK = "#000000";

// GOV.UK's method: the primary mixed with white (tints) or black (shades) at
// GOV.UK's percentages. Mixing #1d70b8 this way gives GOV.UK's blue group
// exactly (lib/palette.test.ts).
const STEPS = {
  "tint-25": [WHITE, 25],
  "tint-50": [WHITE, 50],
  "tint-80": [WHITE, 80],
  "tint-95": [WHITE, 95],
  "shade-10": [BLACK, 10],
  "shade-25": [BLACK, 25],
  "shade-50": [BLACK, 50],
} as const;
type GovukStep = "primary" | keyof typeof STEPS;
// Ours, not GOV.UK's, with the same method: the link colour:
// 3.14 : 1 against body text, where shade-10 was 1.65.
const OUR_STEPS = {
  "tint-20": [WHITE, 20],
} as const;
export type Step = GovukStep | keyof typeof OUR_STEPS;

const channels = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** Sass's color.mix($with, $base, $weight), rounded to a hex as Sass prints it. */
function mix(withHex: string, baseHex: string, weight: number): string {
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
const LINK_STEP: Step = "tint-20";

// The roles GOV.UK derives from its brand blue, in our steps. Visited links
// have no colour of their own: link-visited is the link colour,
// as GOV.UK's links without a visited state.
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

// The header bar: the darkest step, not the
// Generic header's black, as GOV.UK's header takes its brand colour. The
// browser's theme-color and the PDF's band are the same colour.
export const HEADER = PALETTE["shade-50"];
// The "ul." plate on light backgrounds (footer, icons, share card): the
// header's colour. In the header it is GOV.UK white. A role of its own, so
// knip allows the second name (@alias).
/** @alias */
export const PLATE = HEADER;

// IMGW's warning levels 1-3: the solid colours
// IMGW's own warnings map paints them (lvlToColorOsmet in
// shared.imgw.pl/web-components/ostrzezenia-meteo-hydro/ostrzezenia-meteo-hydro.js),
// for the address page's warning cards' bands (app/site.scss), not
// GOV.UK's pale tag tints. Not
// brand colours, so check-palette lets them stand outside docs/brand.md.
export const WARNING_LEVELS = {
  "warning-level-1": "#ffbe00",
  "warning-level-2": "#ff5a00",
  "warning-level-3": "#d60000",
} as const;

// A colour per module of the address page, after the utility colour codes
// people know: water blue, power amber (not red, and darker than the
// plastik bin's yellow, lib/waste-colours.ts), waste green, the weather
// slate. Red is never a module's: it stays GOV.UK's, for what is urgent
// (a failure, IMGW's level 3). Each a group in GOV.UK's steps (group()):
// the primary for bars and rings (3:1 or more on white), shade-25 for its
// text and icons (4.5:1 or more on white and on its tint), tint-80 for an
// icon's tile and a module's badge.
const MODULE_COLOURS = {
  smieci: "#1e7d43",
  woda: "#1767b0",
  prad: "#c46a00",
  pogoda: "#3f6a8a",
} as const;

/**
 * The module colours' steps the site uses, by role.
 * @public design/contrast.mjs checks them (outside knip's view).
 */
export const MODULE_ROLES = Object.fromEntries(
  Object.entries(MODULE_COLOURS).map(([id, primary]) => {
    const steps = group(primary);
    return [
      id,
      {
        main: primary,
        ink: steps["shade-25"],
        tint: steps["tint-80"],
      },
    ];
  }),
) as Record<string, Record<string, string>>;

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
    `$app-accent: ${ACCENT};`,
    ...Object.entries(WARNING_LEVELS).map(([k, v]) => `$app-${k}: ${v};`),
    `$app-modules: (\n${Object.entries(MODULE_ROLES)
      .map(([id, roles]) => `  "${id}": ${map(roles).replaceAll("\n", " ")}`)
      .join(",\n")}\n);`,
    "",
  ].join("\n");
}
