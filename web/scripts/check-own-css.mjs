// Keeps our own CSS almost zero: GOV.UK Frontend
// classes and components only, plus app/site.scss for what GOV.UK has no
// equivalent for. Fails when:
// - a stylesheet appears outside the allowed list;
// - site.scss passes MAX_GZIP compiled (the hard cap) or MAX_LINES of code
//   (blank and comment-only lines are not counted), or uses a raw colour;
// - an own stylesheet has a hack (scripts/lib/css-lint.mjs, R1-R8, R10: a
//   font's or breakpoint's numbers, nudges, negative margins, raw lengths,
//   !important) not allowed by a `// css-allow <rule>: <reason>` comment above
//   it, or more of those than MAX_ALLOWED; every allowed one is printed;
// - a page has an inline style (R9);
// - a page uses govuk-button--inverse (its hover and shadow are GOV.UK brand
//   blue, see check-govuk-assets.mjs);
// - a govuk-tag has no colour modifier (the default tag is GOV.UK brand blue);
// - anything of Tailwind comes back: a package, a config, a directive in a
//   stylesheet, or a utility class (any class not govuk-, app- or js-);
// - a page uses a govuk- or app- class that no rule in the compiled CSS
//   (govuk.scss, site.scss, tokens.css) styles: a GOV.UK component missing
//   from govuk.scss, or a typo. Hook-only classes are in HOOK_ONLY.
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { compile } from "sass";
import { writeBrandAssets } from "./brand-assets.ts";
import { lintCss, lintMarkup, RULES } from "./lib/css-lint.mjs";
import { notSource, walk } from "./lib/files.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED = new Set([
  "app/govuk.scss",
  "app/_settings.scss",
  // Generated from lib/palette.ts, not in git.
  "app/_palette.scss",
  "app/_assets.scss",
  "app/site.scss",
  // The font fallback (no GOV.UK setting for it).
  "app/tokens.css",
  // The bin colours, generated from lib/waste-colours.ts, not in git.
  "app/waste-colours.css",
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
// Our own stylesheets in git, linted for hacks (the generated ones hold
// only colours).
const OWN = [
  "app/site.scss",
  "app/_settings.scss",
  "app/govuk.scss",
  "app/_assets.scss",
  "app/tokens.css",
];
// The caps: CSS ≤ MAX_LINES lines; MAX_GZIP is the gzip limit in bytes. Raised
// from 2770 to 2806 in t368 (t366's audit): the timeline's dot on .5lh
// (C8, 200 % text), GOV.UK's hover bar kept as a border under the logo's
// own box (H3/H4, so forced colours still show it), the bins sized in em
// on flex rows (H10/H11), the button's icon on a flex row (H2) and the
// warning's "!" centred by grid (H6); the hacks they replace are gone.
// t370 kept it at 2806: the header's hover bar, the timeline (a grid, no
// positioned pseudo-elements) and the icon in a link (a flex row) replace
// what they did in the same bytes. t373 raised it to 2812 (Jakub's
// ceiling 2830): the page head's one spacing scale (the street line 10 px
// above the h1, .app-band > .govuk-caption-l); today's dot by its own
// class saved bytes on the selector it replaces.
// t390 raised them to 230 lines and 3600 B (Jakub's ceiling for it: about
// 4,500 B, hard max 10 KB): the home page's hero (its gradient, the search
// card, the reassurances) and „Teraz w gminie” (a head and wrapping
// tiles); the home page's plain item list they replace is gone.
// MAX_ALLOWED: how many css-allow hacks may stay: none since t366's C1
// made the h1 a flex row (t369, t372). Raising either is a reviewed diff.
const MAX_LINES = 230;
const MAX_GZIP = 3600;
const MAX_ALLOWED = 0;

const failures = [];

const files = walk(ROOT, notSource).map((f) => path.relative(ROOT, f));

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
const code = site.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of code.matchAll(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi)) {
  failures.push(
    `app/site.scss: raw value ${match[0]} (use GOV.UK Sass functions)`,
  );
}
// Hacks (R1-R8, R10) in our own stylesheets, and the allowed ones.
const allowed = [];
for (const file of OWN) {
  const lint = lintCss(readFileSync(path.join(ROOT, file), "utf8"), file);
  allowed.push(...lint.allowed);
  for (const f of lint.failures)
    failures.push(
      `${f.file}:${f.line}: ${f.rule} (${RULES[f.rule]}): ${f.text}`,
    );
}
if (allowed.length > MAX_ALLOWED)
  failures.push(
    `${allowed.length} css-allow hacks (max ${MAX_ALLOWED}): lay it out with flex, grid and tokens`,
  );

// The Sass @uses the palette generated from lib/palette.ts (as next build).
await writeBrandAssets();
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
  if (!/\.test\.tsx$/.test(file))
    for (const f of lintMarkup(source, file))
      failures.push(`${f.file}:${f.line}: R9 (${RULES.R9}): ${f.text}`);
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
  `Own CSS: app/site.scss ${lines} lines of code, ${gzip} B gzip compiled; ${tailwind} Tailwind classes; ${styled.size} classes styled, ${unstyled.length} used without a rule; ${allowed.length} allowed hacks (max ${MAX_ALLOWED}):`,
);
for (const a of allowed)
  console.log(
    `  ${a.file}:${a.line} ${a.rules.join(", ")} ${a.text} — ${a.reason}`,
  );
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
