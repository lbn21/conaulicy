// The repository root. No imports, so a domain may use it while loading:
// config.ts imports the domains (../domains.ts) for their config rules.
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../../../..");
