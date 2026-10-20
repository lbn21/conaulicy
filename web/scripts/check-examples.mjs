// Checks the home page's examples (lib/examples.ts): each one opens a place
// page with upcoming pickups, and the home page links to each, in order,
// labelled with the place's own name (the page's h1). Fails otherwise.
//
// Runs against `next start` on the current build and database: in CI that is
// the CI fixture, locally .env.local's data (build with `SITE_BASIC_AUTH= npm run
// build`). With CHECK_URL it checks a deployed site instead, e.g.
// CHECK_URL=https://conaulicy.pl (plus SITE_BASIC_AUTH while the gate is on).
import { HOME_EXAMPLES } from "../lib/examples.ts";
import { startServer } from "./lib/server.mjs";

const server = process.env.CHECK_URL
  ? { origin: process.env.CHECK_URL.replace(/\/$/, ""), stop: () => {} }
  : await startServer(3305);
const headers =
  process.env.CHECK_URL && process.env.SITE_BASIC_AUTH
    ? {
        Authorization: `Basic ${Buffer.from(process.env.SITE_BASIC_AUTH).toString("base64")}`,
      }
    : {};
const failures = [];
const names = new Map();

try {
  for (const id of HOME_EXAMPLES) {
    const response = await fetch(`${server.origin}/adres/${id}`, { headers });
    const html = await response.text();
    const name = html.match(/<h1 class="govuk-heading-l">([^<]+)<\/h1>/)?.[1];
    names.set(id, name);
    if (response.status !== 200 || !name) {
      failures.push(`/adres/${id}: ${response.status}, not a place page`);
    } else if (!html.includes('id="pickups-heading"')) {
      failures.push(`/adres/${id} (${name}): no upcoming pickups`);
    }
  }

  const home = await (await fetch(`${server.origin}/`, { headers })).text();
  const examples = home.slice(home.indexOf('id="sample-heading"'));
  const links = [
    ...examples.matchAll(
      /<a href="\/adres\/([^"]+)" class="govuk-link">([^<]+)</g,
    ),
  ].map(([, id, label]) => ({ id, label }));
  const shown = links.map((l) => `${l.id} ${l.label}`).join(", ");
  const expected = HOME_EXAMPLES.map((id) => `${id} ${names.get(id)}`).join(
    ", ",
  );
  if (shown !== expected) {
    failures.push(`home examples: ${shown}\n  expected ${expected}`);
  }
  console.log(`Home examples (${server.origin}): ${shown}`);
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log("Home examples: every one has upcoming pickups.");
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
