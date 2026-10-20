// We use GOV.UK Frontend's code (MIT), never the GOV.UK brand, which sites off
// GOV.UK must not use (docs/govuk-audit.md). Run after `next build`: fails if
// the build output or public/ contains
// - the GDS Transport typeface (files or @font-face),
// - the crown or the GOV.UK logotype, or a copied govuk-frontend assets/ folder,
// - GOV.UK's brand-blue family in the compiled CSS (hex or rgb()), except
//   inside .govuk-button--inverse rules: govuk-frontend 6.5.1 hard-codes the
//   inverse button's hover and shadow as blue (button/_mixin.scss), with no
//   setting. We never use that button (check-own-css fails on the class), so
//   the blue ships in an unused rule only.
// - except inside accessible-autocomplete's own highlighted-option rule
//   (.autocomplete__option--focused / :hover), which its unchanged CSS paints
//   in brand blue. site.scss overrides that colour with the brand role, and
//   this check fails unless the override is in the compiled CSS.
// or if app/_settings.scss stops turning off GOV.UK's default font face.
// Credits: the compiled CSS must carry GOV.UK Frontend's licence notice;
// /dostepnosc must link the MIT licence and the font's OFL (served from
// public/fonts/OFL.txt, a copy of the one beside the font files).
// Footer: our markup with govuk-footer classes, identical on every page,
// with the CC BY 4.0 line for our texts; never the crown, the crest, the
// Open Government Licence, a Crown copyright line, or the code licences
// (those are on /dostepnosc). No GOV.UK image (crest) URL in the CSS.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN = [".next/static", "public"];
// GOV.UK Frontend 6.5.1's blue group: primary, tints, shades.
const BLUE = [
  "1d70b8",
  "5694ca",
  "8eb8dc",
  "d2e2f1",
  "f4f8fb",
  "1a65a6",
  "16548a",
  "0f385c",
];

function hexToRgb(hex) {
  const n = Number.parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const failures = [];
const files = SCAN.flatMap((dir) => walk(path.join(ROOT, dir)));
let cssFiles = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const name = path.basename(file).toLowerCase();
  if (/gds[-_ ]?transport|^(light|bold)-[0-9a-f]{10}-v2\.woff2?$/.test(name)) {
    failures.push(`${rel}: GDS Transport font file`);
  }
  if (/crown|govuk-logotype|govuk-opengraph|govuk-icon/.test(name)) {
    failures.push(`${rel}: GOV.UK brand image`);
  }
  if (rel.split(path.sep).includes("assets") && /govuk/i.test(rel)) {
    failures.push(`${rel}: copied govuk-frontend assets`);
  }
  if (!/\.(css|js|svg|html|json|txt)$/.test(name)) continue;
  const text = readFileSync(file, "utf8");
  if (/GDS Transport/i.test(text)) {
    failures.push(`${rel}: mentions the GDS Transport typeface`);
  }
  // Markup only: the compiled CSS keeps govuk-footer's unused
  // .govuk-footer__crown margin rule (its crest image is `none`, checked below).
  if (
    !name.endsWith(".css") &&
    /govuk-(header|footer)__(logotype|crown)|govuk-logo-dot/.test(text)
  ) {
    failures.push(`${rel}: GOV.UK crown or logotype markup`);
  }
  if (!name.endsWith(".css")) continue;
  cssFiles += 1;
  for (const hex of BLUE) {
    const [r, g, b] = hexToRgb(hex);
    // None of these has a 3-digit short form, so the full hex and rgb() cover it.
    const pattern = new RegExp(
      `#${hex}\\b|rgba?\\(\\s*${r}[ ,]+${g}[ ,]+${b}\\b`,
      "i",
    );
    for (const [, selector, body] of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (!pattern.test(body)) continue;
      const parts = selector.split(",").map((part) => part.trim());
      const allowed =
        parts.every((part) => part.includes(".govuk-button--inverse")) ||
        parts.every((part) =>
          /^\.autocomplete__option(--focused|:hover)$/.test(part),
        );
      if (!allowed) {
        failures.push(
          `${rel}: GOV.UK brand blue #${hex} in ${selector.trim()}`,
        );
      }
    }
  }
}

// The override of accessible-autocomplete's highlighted option must ship,
// with a colour that is not brand blue.
const css = files
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(file, "utf8"))
  .join("");
const override = [
  ...css.matchAll(
    /([^{}]*\.app-search \.autocomplete__option--focused[^{}]*)\{([^{}]*)\}/g,
  ),
].find(([, , body]) => /background-color:/.test(body));
if (
  /autocomplete__option--focused/.test(css) &&
  (!override || BLUE.some((hex) => override[2].toLowerCase().includes(hex)))
) {
  failures.push(
    "accessible-autocomplete's highlighted option is not overridden (site.scss)",
  );
}

if (cssFiles === 0)
  failures.push("no compiled CSS found: run `next build` first");
const settings = readFileSync(path.join(ROOT, "app/_settings.scss"), "utf8");
if (!/\$govuk-include-default-font-face:\s*false/.test(settings)) {
  failures.push(
    "app/_settings.scss: $govuk-include-default-font-face is not false",
  );
}

if (
  !/--govuk-frontend-licence:\s*"GOV\.UK Frontend v[\d.]+ \| MIT License/.test(
    css,
  )
)
  failures.push("compiled CSS: no GOV.UK Frontend licence notice");
const html = (page) =>
  readFileSync(path.join(ROOT, ".next/server/app", `${page}.html`), "utf8");
const credits = html("dostepnosc");
for (const [href, what] of [
  ["https://github.com/alphagov/govuk-frontend/blob/main/LICENSE.txt", "MIT"],
  ["/fonts/OFL.txt", "SIL OFL"],
]) {
  if (!credits.includes(`href="${href}"`))
    failures.push(`/dostepnosc: no link to the ${what} licence (${href})`);
}
const footerOf = (page) =>
  html(page).match(/<footer[\s\S]*<\/footer>/)?.[0] ?? "";
const footer = footerOf("index");
for (const page of ["dostepnosc", "prywatnosc", "o-projekcie", "_not-found"]) {
  if (footerOf(page) !== footer)
    failures.push(
      `footer: differs on ${page} (it must be the same on every page)`,
    );
}
if (
  !/href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.pl"[^>]*rel="license"|rel="license"[^>]*href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.pl"/.test(
    footer,
  )
)
  failures.push("footer: no CC BY 4.0 licence link");
for (const [pattern, what] of [
  [
    /LICENSE\.txt|\/fonts\/OFL\.txt/,
    "a code licence (it belongs on /dostepnosc)",
  ],
  [
    /Crown copyright|Open Government Licence|nationalarchives\.gov\.uk/i,
    "Crown copyright or OGL",
  ],
  [
    /govuk-footer__(copyright-logo|licence-logo|crown)|govuk-logo/,
    "a GOV.UK crown, crest, OGL or logo class",
  ],
]) {
  if (pattern.test(footer)) failures.push(`footer: ${what}`);
}
if (/govuk-crest|assets\/images\//.test(css))
  failures.push("compiled CSS: a GOV.UK image URL (crest)");
const ofl = (dir) => readFileSync(path.join(ROOT, dir, "OFL.txt"), "utf8");
if (ofl("public/fonts") !== ofl("assets/fonts"))
  failures.push("public/fonts/OFL.txt differs from assets/fonts/OFL.txt");

console.log(
  `GOV.UK assets: ${files.length} files in ${SCAN.join(", ")} scanned (${cssFiles} CSS).`,
);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  "No GDS Transport, crown, GOV.UK logotype, govuk assets or brand blue; licences credited.",
);
