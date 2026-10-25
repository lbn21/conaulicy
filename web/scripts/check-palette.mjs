// The palette has one source, lib/palette.ts (docs/brand.md, "Changing the
// palette"). Fails if a brand colour (any of its steps, as #hex or rgb())
// appears in any other file in the repo, outside the files that must spell
// it out, which are checked against the palette instead:
// - docs/brand.md: the group's row in the palette table and the roles' rows;
// - docs/logo/a-logo-light.svg, a-mark-light.svg: the plate, for download.
// With --fix it rewrites those to the palette. And no raw hex at all in the
// site's code (web/app, components, lib) outside its colour homes: palette.ts,
// govuk-colours.ts and waste-colours.ts. History (docs/tasks,
// docs/reports) may quote old values. The generated files are not in git.
//   node scripts/check-palette.mjs [--fix]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GROUP, PALETTE, PLATE, ROLE_STEPS, ROLES } from "../lib/palette.ts";

const fix = process.argv.includes("--fix");
const REPO = path.resolve(import.meta.dirname, "../..");
const SOURCE = "web/lib/palette.ts";
const HISTORY = /^docs\/(tasks|reports)\//;
const failures = [];

const hexes = new Set(Object.values(PALETTE));
const rgb = (hex) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const BRAND = new RegExp(
  [
    ...[...hexes].map((hex) => `${hex}(?![0-9a-f])`),
    ...[...hexes].map((hex) => `rgba?\\(\\s*${rgb(hex).join(",\\s*")}\\b`),
  ].join("|"),
  "gi",
);

// Files that spell the palette out: [path, rewrite(text) => text].
const PLATE_FILL = /(<path fill=")#[0-9a-f]{6}(" d="[^"]*" mask=)/gi;
const STEP = `wiśnia (${Object.keys(PALETTE).join("|")})`;
const SPELLED = {
  "docs/logo/a-logo-light.svg": (text) =>
    text.replace(PLATE_FILL, `$1${PLATE}$2`),
  "docs/logo/a-mark-light.svg": (text) =>
    text.replace(PLATE_FILL, `$1${PLATE}$2`),
  "docs/brand.md": (text) =>
    text
      .replace(
        /^(\| \*\*wiśnia\*\* [^|]*\|).*$/m,
        `$1 ${Object.values(GROUP).join(" | ")} |`,
      )
      .replace(
        new RegExp(
          `^\\| \`([a-z-]+)\` \\| \\*\\*#[0-9a-f]{6}\\*\\* \\| ${STEP}`,
          "gm",
        ),
        (row, role) =>
          role in ROLES
            ? `| \`${role}\` | **${ROLES[role]}** | wiśnia ${ROLE_STEPS[role]}`
            : row,
      ),
};

// The site's code, where every colour comes from a colour home. Allowed: the
// mask's luminance (white shows, black cuts out), and the test that checks
// GOV.UK's own blue group. "&#8211;" is an HTML character reference, not a
// colour.
const CODE = /^web\/(app|components|lib)\/.*\.(ts|tsx|mjs|css|scss)$/;
const COLOUR_HOMES = new Set([
  SOURCE,
  "web/lib/govuk-colours.ts",
  "web/lib/waste-colours.ts",
  "web/components/plate-mask.tsx",
  "web/lib/palette.test.ts",
]);
const RAW_HEX =
  /(?<!&)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z])/gi;

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: REPO, encoding: "utf8" },
)
  .split("\n")
  .filter((file) => file && file !== SOURCE && !HISTORY.test(file));

for (const file of files) {
  let text;
  try {
    text = readFileSync(path.join(REPO, file), "utf8");
  } catch {
    continue; // deleted in the working tree
  }
  if (text.includes("\0")) continue; // binary
  if (file in SPELLED) {
    const fixed = SPELLED[file](text);
    if (fixed !== text) {
      if (fix) writeFileSync(path.join(REPO, file), fixed);
      else failures.push(`${file}: differs from ${SOURCE} (run with --fix)`);
    }
    continue;
  }
  const code = CODE.test(file) && !COLOUR_HOMES.has(file);
  for (const [i, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(BRAND))
      failures.push(
        `${file}:${i + 1}: brand colour ${match[0]} (read it from ${SOURCE})`,
      );
    if (code)
      for (const match of line.matchAll(RAW_HEX))
        if (!hexes.has(match[0].toLowerCase()))
          failures.push(
            `${file}:${i + 1}: raw colour ${match[0]} (read it from a colour home: lib/palette.ts, govuk-colours.ts, waste-colours.ts)`,
          );
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Palette: ${files.length} files, no brand colour outside ${SOURCE}, no raw colour in the code outside its colour homes; ${Object.keys(SPELLED).length} files that spell it out match${fix ? " (fixed)" : ""}.`,
);
