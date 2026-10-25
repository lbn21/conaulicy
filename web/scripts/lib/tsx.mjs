// Loaded before every unit test (npm test, --import): components (.tsx)
// compiled by Next.js's own SWC, and the "@/" paths and bare module paths
// they use resolved as tsconfig.json does, so a test can render one
// (react-dom/server) without a bundler.
import { register } from "node:module";

register("./tsx-hooks.mjs", import.meta.url);
