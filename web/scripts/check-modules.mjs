// The waste module's subpage (/adres/<id>/smieci, lib/modules.ts) shows the
// street page as it is: for a city street, a village and a split street
// (with a house number, with an unknown one, with none), its <main> is the
// street page's, byte for byte, and both answer 200 (the error variants
// too). Until the street page becomes the hub of modules.
//
// Runs against `next start` on the current build and the CI fixture.
import { finish, ROUTES, startServer } from "./lib/server.mjs";

const MAIN = /<main[\s\S]*<\/main>/;
const path = (name) => ROUTES.find((route) => route.name === name).path;

// [street page, its waste subpage]
const PAIRS = [
  "city-street",
  "city-street-number",
  "village",
  "split-street",
  "split-street-number",
  "split-street-unknown-number",
  "split-street-missing-number",
].map((name) => {
  const [place, query] = path(name).split("?");
  return [
    path(name),
    `${place}/smieci${query === undefined ? "" : `?${query}`}`,
  ];
});

const server = await startServer(3312);
const failures = [];

try {
  for (const [street, waste] of PAIRS) {
    const [a, b] = await Promise.all(
      [street, waste].map(async (p) => {
        const response = await fetch(`${server.origin}${p}`);
        return { status: response.status, html: await response.text() };
      }),
    );
    const mainA = MAIN.exec(a.html)?.[0];
    const mainB = MAIN.exec(b.html)?.[0];
    if (a.status !== 200 || b.status !== 200) {
      failures.push(`${street} ${a.status}, ${waste} ${b.status}, want 200`);
    }
    if (!mainA?.includes("<h1")) {
      failures.push(`${street}: no <main> with an h1`);
    } else if (mainA !== mainB) {
      failures.push(`${waste}: <main> differs from ${street}`);
    }
  }
} finally {
  server.stop();
}

finish(
  failures,
  `Modules: /smieci shows the street page's <main> (${PAIRS.length} pairs).`,
);
