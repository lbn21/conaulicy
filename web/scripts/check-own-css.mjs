// Keeps our own CSS almost zero (docs/govuk-audit.md): GOV.UK Frontend
// classes and components only, plus app/site.scss for what GOV.UK has no
// equivalent for. Fails when:
// - a stylesheet appears outside the allowed list;
// - site.scss passes 1 KB gzip compiled (the hard cap) or 80 lines of code
//   (blank and comment-only lines are not counted), or uses a raw colour or px;
// - a page uses govuk-button--inverse (its hover and shadow are GOV.UK brand
//   blue, see check-govuk-assets.mjs);
// - a govuk-tag has no colour modifier (the default tag is GOV.UK brand blue);
// - anything of Tailwind comes back: a package, a config, a directive in a
//   stylesheet, or a utility class (any class not govuk-, app- or js-).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { compile } from "sass";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED = new Set([
  "app/govuk.scss",
  "app/_settings.scss",
  "app/_palette.scss",
  "app/site.scss",
  // The font fallback and the bin colours (no GOV.UK setting for either).
  "app/tokens.css",
]);
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
const code = site.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
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

let tailwind = 0;
for (const file of files.filter((f) => /\.tsx$/.test(f))) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
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
const packageJson = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
for (const dep of Object.keys(deps).filter((d) => /tailwind|postcss/.test(d))) {
  failures.push(`${dep}: Tailwind or PostCSS is a dependency`);
}

console.log(
  `Own CSS: app/site.scss ${lines} lines of code, ${gzip} B gzip compiled; ${tailwind} Tailwind classes.`,
);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
