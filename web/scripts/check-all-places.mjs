// Checks /ulice (app/ulice/page.tsx) on the CI fixture: it links every place
// of the search index exactly once, to /adres/<id>, and nothing else; the
// town's streets and their letter headings are in Polish order (by the
// street's own name, not its prefix); a place without pickup data (the
// fixture's street in no zone, only it) says „(brak danych)”; every id is
// unique, and the town's heading and every village's line have their SIMC
// ids; a village with streets is one link with its streets nested under it,
// and the town is no place; and the route
// loads no JS beyond what /dostepnosc, a page without client code, loads.
//
// With SCREENSHOT_DIR, also saves screenshots of /ulice at 390 px and 1280 px
// there (needs Playwright's Chromium). Runs against `next start` on the
// current build.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { finish, searchIndexOf, startServer } from "./lib/server.mjs";

const collator = new Intl.Collator("pl");
const LINK = /<a class="govuk-link" href="\/adres\/([^"]+)">([^<]+)<\/a>/g;
const LETTER = /<h3 class="govuk-heading-s">([^<]+)<\/h3>/g;
// "ul. ", "al. ", "os. ", "pl. ": sorted by what follows.
const ownName = (label) => label.replace(/^\p{L}+\.\s+/u, "");
const inOrder = (values) =>
  values.every((v, i) => i === 0 || collator.compare(values[i - 1], v) <= 0);

const server = await startServer(3310);
const failures = [];

try {
  const home = await (await fetch(`${server.origin}/`)).text();
  const { places } = await searchIndexOf(server.origin, home);
  if (places.length === 0) failures.push("/: no search index");
  if (!/<a class="govuk-link" href="\/ulice">/.test(home)) {
    failures.push("/: no link to /ulice");
  }

  const response = await fetch(`${server.origin}/ulice`);
  const html = await response.text();
  if (response.status !== 200) failures.push(`/ulice: ${response.status}`);
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const links = [...main.matchAll(LINK)].map(([, id, label]) => ({
    id: decodeURIComponent(id),
    label,
  }));

  const counts = new Map();
  for (const { id } of links) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, label] of places) {
    const count = counts.get(id) ?? 0;
    if (count !== 1) failures.push(`/ulice: ${id} (${label}) ${count}×`);
  }
  const known = new Set(places.map(([id]) => id));
  // The town is no place: its streets are.
  if (known.has("0972447")) failures.push("index: Lubaczów is a place");
  for (const { id } of links) {
    if (!known.has(id)) failures.push(`/ulice: ${id} is not in the index`);
  }
  if (/target="_blank"/.test(main)) failures.push("/ulice: target=_blank");
  const noData = [
    ...main.matchAll(
      /<a class="govuk-link" href="\/adres\/([^"]+)">[^<]*<\/a> \(brak danych\)/g,
    ),
  ].map(([, id]) => id);
  if (JSON.stringify(noData) !== JSON.stringify(["0972447-23434"])) {
    failures.push(
      `/ulice: „(brak danych)” on ${JSON.stringify(noData)}, want only 0972447-23434`,
    );
  }

  // Every id once; the town's heading and every village's line by SIMC,
  // where the breadcrumbs link, the old ids kept.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repeated.length > 0) failures.push(`/ulice: ids twice: ${repeated}`);
  if (!main.includes('<h2 id="m-0972447" class="govuk-heading-m">'))
    failures.push("/ulice: no id m-0972447 on the town's heading");
  // Villages with streets (each a place too: one link, its streets nested
  // under it), then one without, and a village part.
  const nested =
    '</a><ul class="govuk-list govuk-!-margin-left-4 govuk-!-margin-top-1"><li><a class="govuk-link" href="/adres/';
  for (const [id, line] of [
    [
      "m-0606234",
      `<a class="govuk-link" href="/adres/0606234">Lisie Jamy (gm. Lubaczów)${nested}0606234-`,
    ],
    [
      "m-0606286",
      `<a class="govuk-link" href="/adres/0606286">Młodów (gm. Lubaczów)${nested}0606286-`,
    ],
    [
      "m-0606180",
      `<a class="govuk-link" href="/adres/0606180">Krowica Sama (gm. Lubaczów)${nested}0606180-`,
    ],
    ["m-0606010", '<a class="govuk-link" href="/adres/0606010">'],
    ["m-0606027", '<a class="govuk-link" href="/adres/0606027">'],
  ]) {
    if (!main.includes(`<li id="${id}">${line}`))
      failures.push(`/ulice: no line ${id}`);
  }
  // Every village line has one.
  const villages = main.slice(main.indexOf('id="wsie-heading"'));
  const lines = villages.match(/<ul class="govuk-list">([\s\S]*)<\/ul>/)?.[1];
  const bare = (lines ?? "").match(
    /<li>(?!<a class="govuk-link" href="\/adres\/[^"]*-)/g,
  );
  if (bare) failures.push(`/ulice: ${bare.length} village lines without id`);
  for (const id of ["ulice-heading", "wsie-heading"]) {
    if (!ids.includes(id)) failures.push(`/ulice: no id ${id}`);
  }

  const town = main.slice(
    main.indexOf('id="ulice-heading"'),
    main.indexOf('id="wsie-heading"'),
  );
  const streets = [...town.matchAll(LINK)].map(([, , label]) => label);
  const letters = [...town.matchAll(LETTER)].map(([, letter]) => letter);
  if (streets.length === 0) failures.push("/ulice: no town streets");
  if (!inOrder(streets.map(ownName))) {
    failures.push(`/ulice: town streets out of order: ${streets.join(", ")}`);
  }
  if (!inOrder(letters) || new Set(letters).size !== letters.length) {
    failures.push(`/ulice: letters out of order: ${letters.join(" ")}`);
  }

  const stats = JSON.parse(
    readFileSync(".next/diagnostics/route-bundle-stats.json", "utf8"),
  );
  const chunks = (route) =>
    stats.find((r) => r.route === route)?.firstLoadChunkPaths;
  const own = chunks("/ulice");
  const shared = new Set(chunks("/dostepnosc") ?? []);
  if (!own) failures.push("/ulice: not in route-bundle-stats.json");
  for (const chunk of own ?? []) {
    if (!shared.has(chunk)) failures.push(`/ulice: own JS ${chunk}`);
  }

  console.log(
    `/ulice: ${links.length} links for ${places.length} places; town ${streets.length} streets under ${letters.join(" ")}; ${own?.length ?? 0} JS chunks, all shared`,
  );

  if (process.env.SCREENSHOT_DIR) {
    const { chromium } = await import("playwright");
    const dir = process.env.SCREENSHOT_DIR;
    mkdirSync(dir, { recursive: true });
    const browser = await chromium.launch();
    try {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        await page.goto(`${server.origin}/ulice`, { waitUntil: "load" });
        const file = path.join(dir, `ulice-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`Screenshot: ${file}`);
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.stop();
}

finish(failures, "/ulice: every place once, Polish order, no JS of its own.");
