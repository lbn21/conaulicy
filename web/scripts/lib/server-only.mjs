// Loaded before every unit test (npm test, --import) and by water:dry-run:
// "server-only" resolves to an empty module, as Next.js resolves it on the
// server (its "react-server" condition), so plain Node can load server-only
// modules (lib/date-labels.ts). Outside that condition the installed
// package throws on import, and Node cannot take "react-server" for every
// package: react-dom/server would then load React's server build.
import { register } from "node:module";

const hooks = `export async function resolve(specifier, context, next) {
  return specifier === "server-only"
    ? { url: "data:text/javascript,", shortCircuit: true }
    : next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
