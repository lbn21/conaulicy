// Checks /ulice (app/ulice/page.tsx) on the CI fixture: it links every place
// of the search index exactly once, to /adres/<id>, and nothing else; the
// town's streets and their letter headings are in Polish order (by the
// street's own name, not its prefix); a place without pickup data (the
// fixture's street in no zone, only it) says „(brak danych)”; and the route
// loads no JS beyond what /dostepnosc, a page without client code, loads.
//
// With SCREENSHOT_DIR, also saves screenshots of /ulice at 390 px and 1280 px
// there (needs Playwright's Chromium). Runs against `next start` on the
// current build.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { finish, startServer } from "./lib/server.mjs";

const collator = new Intl.Collator("pl");
const LINK = /<a href="\/adres\/([^"]+)" class="govuk-link">([^<]+)<\/a>/g;
const LETTER = /<h3 class="govuk-heading-s">([^<]+)<\/h3>/g;
// "ul. ", "al. ", "os. ", "pl. ": sorted by what follows.
const ownName = (label) => label.replace(/^\p{L}+\.\s+/u, "");
const inOrder = (values) =>
  values.every((v, i) => i === 0 || collator.compare(values[i - 1], v) <= 0);

const server = await startServer(3310);
const failures = [];

try {
  const home = await (await fetch(`${server.origin}/`)).text();
  const indexUrl = /\/api\/search-index\/[\da-f]{16}/.exec(home)?.[0];
  const places = indexUrl
    ? await (await fetch(`${server.origin}${indexUrl}`)).json()
    : [];
  if (places.length === 0) failures.push("/: no search index");
  if (!/<a href="\/ulice" class="govuk-link">/.test(home)) {
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
  for (const { id } of links) {
    if (!known.has(id)) failures.push(`/ulice: ${id} is not in the index`);
  }
  if (/target="_blank"/.test(main)) failures.push("/ulice: target=_blank");
  const noData = [
    ...main.matchAll(
      /<a href="\/adres\/([^"]+)" class="govuk-link">[^<]*<\/a> \(brak danych\)/g,
    ),
  ].map(([, id]) => id);
  if (JSON.stringify(noData) !== JSON.stringify(["0972447-23434"])) {
    failures.push(
      `/ulice: „(brak danych)” on ${JSON.stringify(noData)}, want only 0972447-23434`,
    );
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
