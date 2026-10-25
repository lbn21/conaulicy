// The hooks for scripts/lib/tsx.mjs.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
// Loaded on the first .tsx only: most tests never need it.
let bindings;

/** "@/lib/x" → web/lib/x.ts; "./x" from a .ts or .tsx: x.ts or x.tsx. */
export async function resolve(specifier, context, next) {
  const fromTs = /\.tsx?$/.test(context.parentURL ?? "");
  const base = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), ROOT)
    : fromTs && specifier.startsWith(".")
      ? new URL(specifier, context.parentURL)
      : null;
  if (base) {
    for (const ext of EXTENSIONS) {
      const url = new URL(`${base.href}${ext}`);
      if (ext !== "" || /\.tsx?$/.test(url.pathname))
        if (existsSync(fileURLToPath(url)))
          return { url: url.href, shortCircuit: true };
    }
  }
  // Next.js's own entry points ("next/navigation") are files next to
  // its package.json, with no exports map.
  if (/^next\/[^.]+$/.test(specifier)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.endsWith(".tsx")) return next(url, context);
  const source = readFileSync(fileURLToPath(url), "utf8");
  bindings ??= import("next/dist/build/swc/index.js").then((swc) =>
    swc.loadBindings(),
  );
  const { code } = await (await bindings).transform(source, {
    filename: fileURLToPath(url),
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      transform: { react: { runtime: "automatic" } },
      target: "es2022",
    },
    module: { type: "es6" },
  });
  return { format: "module", source: code, shortCircuit: true };
}
