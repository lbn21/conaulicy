// Keeps our own CSS almost zero (docs/govuk-audit.md): GOV.UK Frontend
// classes and components only, plus app/site.scss for what GOV.UK has no
// equivalent for. Fails when:
// - a stylesheet appears outside the allowed list;
// - site.scss passes 1 KB gzip compiled (the hard cap) or 80 lines of code
//   (blank and comment-only lines are not counted), or uses a raw colour or px
//   (except the exact declarations in RAW_PX, GOV.UK's own magic numbers);
// - a page uses govuk-button--inverse (its hover and shadow are GOV.UK brand
//   blue, see check-govuk-assets.mjs);
// - a govuk-tag has no colour modifier (the default tag is GOV.UK brand blue);
// - anything of Tailwind comes back: a package, a config, a directive in a
//   stylesheet, or a utility class (any class not govuk-, app- or js-);
// - a page uses a govuk- or app- class that no rule in the compiled CSS
//   (govuk.scss, site.scss, tokens.css) styles: a GOV.UK component missing
//   from govuk.scss, or a typo. Hook-only classes are in HOOK_ONLY.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { compile } from "sass";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED = new Set([
  "app/govuk.scss",
  "app/_settings.scss",
  "app/_palette.scss",
  "app/_assets.scss",
  "app/site.scss",
  // The font fallback and the bin colours (no GOV.UK setting for either).
  "app/tokens.css",
]);
// Classes in the markup that are hooks, with no rule of their own.
const HOOK_ONLY = new Map([
  ["govuk-template__header", "template.njk hook, unstyled in GOV.UK Frontend"],
  ["govuk-template__footer", "template.njk hook, unstyled in GOV.UK Frontend"],
  [
    "govuk-generic-header__container",
    "only its --full-width modifier is styled",
  ],
  [
    "govuk-frontend-supported",
    "template.njk's JS support hook on body, no rule in our components",
  ],
]);
// The only raw px in site.scss: the GOV.UK header's logo geometry, copied
// from govuk-frontend's components/header/_mixin.scss, which writes them as
// magic px. Each must appear exactly as here, once.
const RAW_PX = [
  // .govuk-header__logo: logo-styles($padding-top: 16px, $padding-bottom: 14px - 2px),
  // changed to 18/11 to centre our plate exactly, bar 1px taller (tasks 78 and 82,
  // a deviation)
  "logo-styles($padding-top: 18px, $padding-bottom: 11px)",
  // .govuk-header__logotype: top: -3px, changed to -2px with the line 1px higher,
  // so the focus bar is centred under the plate (task 82, a deviation)
  "top: -2px;",
  // .govuk-header__logotype: margin-bottom: $logo-bottom-margin (2px)
  "margin-bottom: 2px;",
  // Ours, not GOV.UK's (tasks 78 and 82): the focused logo's even 6px of yellow
  // round the plate, measured against Atkinson's content area at 30px.
  "margin-left: -6px;",
  "padding: 1px 6px 0;",
  // .govuk-generic-header__homepage-link:hover: 3px bar, made 4px as the focus
  // bar, centred under the plate (task 82, Jakub's decision)
  "margin-bottom: -4px;",
  "border-bottom-width: 4px;",
];
const MAX_LINES = 80;
const MAX_GZIP = 1000;

const failures = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full));
  }
  return out;
}
const files = walk(ROOT);

for (const file of files.filter((f) => /\.(css|scss|sass)$/.test(f))) {
  if (!ALLOWED.has(file))
    failures.push(
      `${file}: new stylesheet (use GOV.UK classes, or app/site.scss)`,
    );
  else if (
    /@import\s+["']tailwindcss|@(theme|apply|utility|variant|plugin|tailwind)\b/.test(
      readFileSync(path.join(ROOT, file), "utf8"),
    )
  )
    failures.push(`${file}: Tailwind directive`);
}
for (const file of files.filter((f) =>
  /(^|\/)(tailwind|postcss)\.config\.|(^|\/)\.?postcssrc/.test(f),
)) {
  failures.push(`${file}: Tailwind or PostCSS config`);
}

const site = readFileSync(path.join(ROOT, "app/site.scss"), "utf8");
// Lines of code only: blank lines and comment-only lines don't count.
const lines = site
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("//")).length;
if (lines > MAX_LINES)
  failures.push(`app/site.scss: ${lines} lines (max ${MAX_LINES})`);
let code = site.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
for (const declaration of RAW_PX) {
  const count = code.split(declaration).length - 1;
  if (count !== 1)
    failures.push(
      `app/site.scss: RAW_PX "${declaration}" appears ${count} times (expected once)`,
    );
  code = code.replace(declaration, "");
}
for (const match of code.matchAll(
  /#[0-9a-f]{3,8}\b|\b\d*\.?\d+px\b|\brgba?\(|\bhsla?\(/gi,
)) {
  failures.push(
    `app/site.scss: raw value ${match[0]} (use GOV.UK Sass functions)`,
  );
}
const css = compile(path.join(ROOT, "app/site.scss"), {
  loadPaths: [path.join(ROOT, "node_modules")],
  style: "compressed",
}).css;
const gzip = gzipSync(css, { level: 9 }).length;
if (gzip > MAX_GZIP)
  failures.push(`app/site.scss: ${gzip} B gzip compiled (max ${MAX_GZIP})`);

// Every class selector the site's CSS defines.
const styled = new Set();
for (const file of ["app/govuk.scss", "app/site.scss", "app/tokens.css"]) {
  const out = file.endsWith(".css")
    ? readFileSync(path.join(ROOT, file), "utf8")
    : compile(path.join(ROOT, file), {
        loadPaths: [path.join(ROOT, "node_modules")],
        quietDeps: true,
        silenceDeprecations: ["import"],
      }).css;
  const rules = out
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"[^"]*"|'[^']*'|url\([^)]*\)/g, "");
  for (const [, name] of rules.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
    styled.add(name);
}

let tailwind = 0;
const unstyled = [];
for (const file of files.filter((f) => /\.tsx$/.test(f))) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  // govuk- and app- classes in any string or template literal of the pages:
  // className itself, and class strings held in variables or conditionals.
  // Comments, imports and data-module values are not classes.
  if (/^(app|components)\//.test(file)) {
    const strings = source
      .replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, "$1")
      .replace(/\bfrom\s+"[^"]*"|data-module="[^"]*"/g, "");
    const used = new Set();
    for (const [literal] of strings.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
      for (const [name] of literal.matchAll(
        /(?<![\w/@.-])(?:govuk|app)-[a-z0-9_-]*[a-z0-9]/g,
      ))
        used.add(name);
    }
    for (const name of used) {
      if (!styled.has(name) && !HOOK_ONLY.has(name))
        unstyled.push(`${file}: .${name} has no rule in the CSS`);
    }
  }
  for (const [, quoted, template] of source.matchAll(
    /className=(?:"([^"]*)"|\{`([^`]*)`\})/g,
  )) {
    for (const name of (quoted ?? template).split(/\s+/)) {
      if (!name || name.includes("${")) continue;
      if (/^(govuk-|app-|js-)/.test(name)) continue;
      tailwind += 1;
    }
  }
  if (source.includes("govuk-button--inverse")) {
    failures.push(`${file}: govuk-button--inverse (GOV.UK brand blue)`);
  }
  for (const [tag] of source.matchAll(/\bgovuk-tag\b(?!--|__)[^"`]*/g)) {
    if (!/govuk-tag--/.test(tag))
      failures.push(`${file}: govuk-tag without a colour modifier`);
  }
}
if (tailwind > 0) {
  failures.push(`${tailwind} Tailwind classes: use GOV.UK classes`);
}
failures.push(...unstyled);
for (const name of HOOK_ONLY.keys()) {
  if (styled.has(name))
    failures.push(`HOOK_ONLY: .${name} is styled now, remove it from the list`);
}
const packageJson = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
for (const dep of Object.keys(deps).filter((d) => /tailwind|postcss/.test(d))) {
  failures.push(`${dep}: Tailwind or PostCSS is a dependency`);
}

console.log(
  `Own CSS: app/site.scss ${lines} lines of code, ${gzip} B gzip compiled; ${tailwind} Tailwind classes; ${styled.size} classes styled, ${unstyled.length} used without a rule.`,
);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
