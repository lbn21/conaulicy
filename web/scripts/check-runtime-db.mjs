// The site never reads the database: Neon is the import's alone, and every
// page, route, cron and build reads the dataset snapshot (lib/dataset.ts;
// docs/database.md, "The dataset snapshot"). Fails if any file of the
// site's runtime code (web/app, web/components, web/lib,
// web/next.config.ts; tests there too) imports the database client or
// schema (web/db), Drizzle, a Postgres driver (@neondatabase/*, pg,
// postgres), or the import's database code (web/scripts), or names a
// database variable (DATABASE_URL*, POSTGRES_URL*, PGHOST). The importers
// under web/scripts are the database's side and exempt.
//   node scripts/check-runtime-db.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const ROOTS = ["app", "components", "lib", "next.config.ts"];
const CODE = /\.(ts|tsx|mts|js|mjs|cjs)$/;

function* files(entry) {
  const full = path.join(WEB, entry);
  if (statSync(full).isFile()) {
    if (CODE.test(entry)) yield entry;
    return;
  }
  for (const name of readdirSync(full)) yield* files(path.join(entry, name));
}

const SPECIFIER =
  /\b(?:from|import)\s*\(?\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\)/g;
const DRIVER =
  /^(?:drizzle-orm|drizzle-kit|@neondatabase\/[^/]+|pg|postgres)(?:\/|$)/;
const VARIABLE = /\b(?:DATABASE_URL\w*|POSTGRES_URL\w*|PGHOST)\b/;

/** Why `specifier`, imported from `file`, is the database's; null if not. */
function databaseImport(file, specifier) {
  if (DRIVER.test(specifier)) return "a database driver or ORM";
  const target = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? path.relative(WEB, path.resolve(WEB, path.dirname(file), specifier))
      : null;
  if (target === null) return null;
  if (
    target === "db" ||
    target.startsWith("db/") ||
    target.startsWith(`db${path.sep}`)
  )
    return "the database client or schema (web/db)";
  if (target.startsWith("scripts")) return "the import's code (web/scripts)";
  return null;
}

const failures = [];
let checked = 0;
for (const root of ROOTS)
  for (const file of files(root)) {
    checked++;
    const text = readFileSync(path.join(WEB, file), "utf8");
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2];
      const why = databaseImport(file, specifier);
      if (why) failures.push(`${file}: imports ${specifier}, ${why}`);
    }
    const variable = VARIABLE.exec(text);
    if (variable) failures.push(`${file}: names ${variable[0]}`);
  }

if (failures.length > 0) {
  console.error(
    `The site's code must not reach the database (read the snapshot, lib/dataset.ts):\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(`Runtime code: no database (${checked} files).`);
