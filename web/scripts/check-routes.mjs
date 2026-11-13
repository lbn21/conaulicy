// The routes smoke: eleven checks of the built site on one
// `next start` and the CI fixture, each in scripts/routes/:
//   examples    the home page's examples have upcoming pickups;
//   all-places  /ulice lists every place once, in Polish order;
//   metadata    each page's title, description, share tags and manifest;
//   query       unknown query parameters redirect to the clean URL, the
//               search lands on its place, renamed ids redirect;
//   in-page     in-page links land, Back after them shows the right page;
//   search      a chosen suggestion (click, tap, Enter) opens its place;
//   swap        the skeleton's band and the page's in the same place,
//               on every subpage, /woda with its fixture cut's actions;
//   zoom        at 200 % text, the timeline's dots on their date lines;
//               at 100 and 200 %, the h1's tile on its first line;
//   head        the address pages' heads on one spacing scale;
//   timeline    today's row once, first, its dot alone filled; an empty
//               row no card and no badge;
//   soft-nav    after client-side navigations from and to the home page,
//               the width containers centred, the hero on home only.
// Every check by default; name some to run only those
// (`node scripts/check-routes.mjs examples`). With CHECK_URL, a deployed
// site instead of a local server (examples only: the others need the
// fixture or the build's files).
import { closeRenderedPages, finish, startServer } from "./lib/server.mjs";
import { check as allPlaces } from "./routes/all-places.mjs";
import { check as examples } from "./routes/examples.mjs";
import { check as head } from "./routes/head.mjs";
import { check as inPage } from "./routes/in-page.mjs";
import { check as metadata } from "./routes/metadata.mjs";
import { check as query } from "./routes/query.mjs";
import { check as search } from "./routes/search.mjs";
import { check as softNav } from "./routes/soft-nav.mjs";
import { check as swap } from "./routes/swap.mjs";
import { check as timeline } from "./routes/timeline.mjs";
import { check as zoom } from "./routes/zoom.mjs";

const CHECKS = {
  examples,
  "all-places": allPlaces,
  metadata,
  query,
  "in-page": inPage,
  search,
  swap,
  zoom,
  head,
  timeline,
  "soft-nav": softNav,
};

const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !Object.hasOwn(CHECKS, name));
if (unknown.length > 0) {
  console.error(
    `Unknown: ${unknown.join(", ")}. Checks: ${Object.keys(CHECKS).join(", ")}`,
  );
  process.exit(2);
}
const names = asked.length > 0 ? asked : Object.keys(CHECKS);

const server = process.env.CHECK_URL
  ? { origin: process.env.CHECK_URL.replace(/\/$/, ""), stop: () => {} }
  : await startServer(3305);
const failures = [];
const summaries = [];

try {
  for (const name of names) {
    const own = [];
    summaries.push(await CHECKS[name](server, own));
    failures.push(...own.map((failure) => `${name}: ${failure}`));
  }
} finally {
  await closeRenderedPages();
  server.stop();
}

finish(failures, summaries.join("\n"));
