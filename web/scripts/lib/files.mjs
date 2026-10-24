// Every file under a directory, as full paths. `skip` leaves a file or
// directory out by its name.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export function walk(dir, skip = () => false, out = []) {
  for (const name of readdirSync(dir)) {
    if (skip(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, skip, out);
    else out.push(full);
  }
  return out;
}

/** Dependencies and dot-files (.next, .git, .env*): not our sources. */
export const notSource = (name) =>
  name === "node_modules" || name.startsWith(".");
