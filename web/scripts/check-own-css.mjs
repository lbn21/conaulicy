// Keeps our own CSS almost zero (docs/govuk-audit.md): GOV.UK Frontend
// classes and components only, plus app/site.scss for what GOV.UK has no
// equivalent for. Fails when:
// - a stylesheet appears outside the allowed list;
// - site.scss passes 80 lines or 1 KB gzip compiled, or uses a raw colour or px;
// - a govuk-tag has no colour modifier (the default tag is GOV.UK brand blue);
// - Tailwind utility classes grow: they may only go down, until PR 8 deletes
//   Tailwind (then BASELINE is 0 and tailwindcss must be gone).
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
  // Tailwind and its tokens, until PR 8.
  "app/globals.css",
  "app/tokens.css",
]);
const MAX_LINES = 80;
const MAX_GZIP = 1000;
// Tailwind utility classes in components and pages today; lower it as pages
// move to GOV.UK classes, never raise it.
const BASELINE = 336;

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
}

const site = readFileSync(path.join(ROOT, "app/site.scss"), "utf8");
const lines = site.split("\n").length;
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
  for (const [tag] of source.matchAll(/\bgovuk-tag\b(?!--|__)[^"`]*/g)) {
    if (!/govuk-tag--/.test(tag))
      failures.push(`${file}: govuk-tag without a colour modifier`);
  }
}
if (tailwind > BASELINE) {
  failures.push(
    `${tailwind} Tailwind classes (baseline ${BASELINE}): use GOV.UK classes`,
  );
}
const packageJson = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
if (BASELINE === 0 && Object.keys(deps).some((d) => d.includes("tailwind"))) {
  failures.push("Tailwind is still a dependency");
}

console.log(
  `Own CSS: app/site.scss ${lines} lines, ${gzip} B gzip compiled; ${tailwind} Tailwind classes left (baseline ${BASELINE}).`,
);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
