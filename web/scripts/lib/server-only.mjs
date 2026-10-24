// Loaded before every unit test (npm test, --import): "server-only" resolves
// to an empty module, as Next.js resolves it on the server (the package is
// not installed), so tests can load server-only modules (lib/date-labels.ts).
import { register } from "node:module";

const hooks = `export async function resolve(specifier, context, next) {
  return specifier === "server-only"
    ? { url: "data:text/javascript,", shortCircuit: true }
    : next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
