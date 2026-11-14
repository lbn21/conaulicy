import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { keepWarmPaths } from "../lib/keepwarm.ts";
import { OUTPUT_PATHS } from "./brand-assets.ts";

// The keep-warm's list (lib/keepwarm.ts) has the paths of every route of
// app/ that the build prerenders, from the build's own sources, and no
// path of none: a new route, metadata file or dynamic segment fails here
// until the list covers it. Here, not in lib/: it reads the brand step's
// outputs (scripts/brand-assets.ts), which lib/ may not import.

const APP = join(import.meta.dirname, "..", "app");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

// Next.js's metadata routes, a file at app/'s root that is a route by
// its name: the generated ones (robots.ts) at their file's path, the
// static ones (icon.svg) at their own name, a generated image (icon.tsx)
// at its name.
const GENERATED: Record<string, string> = {
  robots: "/robots.txt",
  sitemap: "/sitemap.xml",
  manifest: "/manifest.webmanifest",
};
const IMAGES = /^(favicon|icon|apple-icon|opengraph-image|twitter-image)\./;

function metadataRoute(name: string): string | null {
  const code = /^(.+)\.tsx?$/.exec(name);
  if (code && GENERATED[code[1]]) return GENERATED[code[1]];
  if (!IMAGES.test(name)) return null;
  return code ? `/${code[1]}` : `/${name}`;
}

/**
 * Every file of app/, by its path in it: on disk, and those the build's
 * brand step draws there (scripts/brand-assets.ts: the icons, not in git).
 */
function appFiles(): string[][] {
  const drawn = OUTPUT_PATHS.filter((out) => out.startsWith("app/")).map(
    (out) => out.split("/").slice(1),
  );
  const onDisk = files(APP).map((file) => relative(APP, file).split(sep));
  const seen = new Set<string>();
  return [...onDisk, ...drawn].filter((rel) => {
    const key = rel.join("/");
    return !seen.has(key) && seen.add(key);
  });
}

/** Every prerendered route of app/: its URL pattern, the API's apart. */
function routePatterns(): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>();
  for (const rel of appFiles()) {
    const name = rel.at(-1) ?? "";
    let route: string | null = null;
    if (/^(page|route)\.tsx?$/.test(name))
      route = `/${rel.slice(0, -1).join("/")}`;
    else if (rel.length === 1) route = metadataRoute(name);
    if (route === null || route.startsWith("/api/")) continue;
    const source = route
      .split("/")
      .map((part) =>
        /^\[[^\]]+\]$/.test(part)
          ? "[^/]+"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/");
    patterns.set(route, new RegExp(`^${source || "/"}$`));
  }
  return patterns;
}

test("every prerendered route of app/ has its paths kept warm, and no path is none's", async () => {
  const patterns = routePatterns();
  assert.ok(patterns.size >= 10, String(patterns.size));
  const paths = await keepWarmPaths();
  for (const [route, pattern] of patterns)
    assert.ok(
      paths.some((path) => pattern.test(path)),
      `${route}: no path kept warm`,
    );
  for (const path of paths)
    assert.ok(
      [...patterns.values()].some((pattern) => pattern.test(path)),
      `${path}: no route`,
    );
  assert.deepEqual(paths, [...new Set(paths)].sort());
});
