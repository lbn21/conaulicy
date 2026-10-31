// Validates the HTML of every key route with the Nu Html Checker (vnu.jar,
// the engine behind validator.w3.org/nu). Fails on any error; lists warnings.
// Each route as an HTML-limited bot gets it (metadata in <head>), and as a
// browser does, unless Next.js streamed it the metadata (into <body>, as
// documented: /szukaj, rendered per request); then only its bot copy.
//
// Needs Java 11+: JAVA_HOME, or `java` on PATH. Without Java it stops, unless
// HTML_CHECK_REMOTE=1 asks for the public validator.w3.org/nu API instead.
// With HTML_DIR, also keeps every page's HTML there, as served (for the
// reviewer: before/after a change to rendering). Run after `next build`.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { BOT_UA, BROWSER_UA, ROUTES, startServer } from "./lib/server.mjs";

const require = createRequire(import.meta.url);
const VNU_JAR = path.join(
  path.dirname(require.resolve("vnu-jar/package.json")),
  "build/dist/vnu.jar",
);

function findJava() {
  const java = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", "java")
    : "java";
  const probe = spawnSync(java, ["-version"], { stdio: "ignore" });
  return probe.status === 0 ? java : null;
}

function checkLocally(java, files) {
  const result = spawnSync(
    java,
    ["-jar", VNU_JAR, "--format", "json", "--stdout", ...files],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (!result.stdout)
    throw new Error(result.stderr || "vnu.jar gave no output");
  return JSON.parse(result.stdout).messages;
}

async function checkRemotely(html, url) {
  const res = await fetch("https://validator.w3.org/nu/?out=json", {
    method: "POST",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "User-Agent": "conaulicy-check-html",
    },
    body: html,
  });
  if (!res.ok) throw new Error(`validator.w3.org answered ${res.status}`);
  const { messages } = await res.json();
  return messages.map((message) => ({ ...message, url }));
}

const java = findJava();
const remote = process.env.HTML_CHECK_REMOTE === "1";
if (!java && !remote) {
  console.error(
    "No Java found. Set JAVA_HOME (Java 11+), or run with HTML_CHECK_REMOTE=1 to use validator.w3.org/nu.",
  );
  process.exit(2);
}

const server = await startServer();
const dir =
  process.env.HTML_DIR ?? mkdtempSync(path.join(tmpdir(), "conaulicy-html-"));
mkdirSync(dir, { recursive: true });
const files = new Map();
let messages = [];
const streamed = [];
try {
  for (const route of ROUTES) {
    for (const [ua, suffix] of [
      [BROWSER_UA, ""],
      [BOT_UA, ".bot"],
    ]) {
      const res = await fetch(server.origin + route.path, {
        headers: { "user-agent": ua },
      });
      const expected = route.status ?? 200;
      if (res.status !== expected) {
        throw new Error(
          `${route.path}${suffix}: HTTP ${res.status}, expected ${expected}`,
        );
      }
      const html = await res.text();
      const file = path.join(dir, `${route.name}${suffix}.html`);
      writeFileSync(file, html);
      if (
        !suffix &&
        !html.slice(0, html.indexOf("</head>")).includes("<title>")
      ) {
        streamed.push(route.path);
        continue;
      }
      files.set(`file:${file}`, `${route.path}${suffix && " (bot)"}`);
      if (!java) messages.push(...(await checkRemotely(html, `file:${file}`)));
    }
  }
  if (java)
    messages = checkLocally(
      java,
      [...files.keys()].map((f) => f.slice(5)),
    );
} finally {
  server.stop();
}

const errors = messages.filter(
  (m) => m.type === "error" || m.subType === "fatal",
);
const warnings = messages.filter(
  (m) => m.type === "info" && m.subType === "warning",
);

function print(list, label) {
  for (const m of list) {
    const where = files.get(m.url) ?? m.url;
    const line = m.lastLine ? `:${m.lastLine}` : "";
    console.log(`${label} ${where}${line}  ${m.message}`);
    if (m.extract) console.log(`    ${m.extract.replace(/\n/g, " ").trim()}`);
  }
}

print(errors, "ERROR  ");
print(warnings, "warning");
const engine = java
  ? `vnu.jar ${execFileSync(java, ["-jar", VNU_JAR, "--version"], { encoding: "utf8" }).trim()}`
  : "validator.w3.org/nu";
console.log(
  `\n${files.size} documents (${ROUTES.length} pages, browser and bot; metadata streamed to the browser, its bot copy only: ${streamed.join(", ") || "none"}), ${errors.length} errors, ${warnings.length} warnings (${engine}).`,
);
if (!process.env.HTML_DIR) rmSync(dir, { recursive: true, force: true });
process.exit(errors.length > 0 ? 1 : 0);
