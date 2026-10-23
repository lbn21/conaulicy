// Checks what search engines are told (lib/indexing.ts), per build:
//   --expect=noindex  a normal CI build: X-Robots-Tag and meta robots say
//                     noindex, nofollow; robots.txt disallows everything.
//   --expect=index    a production-like build (VERCEL_ENV=production, no
//                     SITE_BASIC_AUTH): no X-Robots-Tag, meta robots says
//                     index, follow; robots.txt allows all but /api/ and
//                     names the sitemap; conaulicy.vercel.app redirects (308)
//                     to conaulicy.pl, path and query kept.
// Both: /sitemap.xml is well-formed; empty unless indexable, else the five
// static pages (/ulice included) and every place in the search index but
// those /ulice marks „(brak danych)”, nothing else. PDFs and calendars send
// X-Robots-Tag: noindex; the number-error page (/numer), a place without
// data and /szukaj have meta robots noindex (/szukaj the header too); the
// static pages have one canonical link each. 404s (an unknown path, unknown
// addresses) are whole pages in the raw HTML, no JS needed: status 404, the
// layout (lang, stylesheet), GOV.UK's "page not found" H1, and one robots
// meta, noindex.
//
// Runs against `next start` on the current build and the CI fixture.
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { ROUTES, startServer } from "./lib/server.mjs";

const mode = process.argv
  .find((arg) => arg.startsWith("--expect="))
  ?.slice("--expect=".length);
if (mode !== "noindex" && mode !== "index") {
  console.error(
    "Usage: node scripts/check-indexing.mjs --expect=noindex|index",
  );
  process.exit(2);
}
const index = mode === "index";

const PAGES = ["home", "city-street", "village", "accessibility"].map(
  (name) => ROUTES.find((route) => route.name === name).path,
);
const META = /<meta name="robots" content="([^"]*)"\/?>/g;

// node:http, not fetch: fetch may not send a Host header of our own.
const get = (origin, path, headers) =>
  new Promise((resolve, reject) => {
    request(`${origin}${path}`, { headers }, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    })
      .on("error", reject)
      .end();
  });

const SITE = "https://conaulicy.pl";
const STATIC = ["/", "/ulice", "/dostepnosc", "/prywatnosc", "/o-projekcie"];
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const CANONICAL = /<link rel="canonical" href="([^"]*)"\/?>/g;
// Tags or text, nothing else: whatever is left over is malformed.
const TOKEN =
  /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/gy;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i;

/**
 * A small, dependency-free XML check for the sitemap: the declaration, then
 * one <urlset> in the sitemap namespace holding <url> elements with exactly
 * one <loc> each; every tag closed in order. Returns the <loc> values.
 */
function sitemapLocs(xml) {
  const declaration = /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*/.exec(xml);
  if (!declaration) throw new Error("no <?xml …?> declaration");
  const stack = [];
  const locs = [];
  let roots = 0;
  let url = null;
  TOKEN.lastIndex = declaration[0].length;
  while (TOKEN.lastIndex < xml.length) {
    const at = TOKEN.lastIndex;
    const match = TOKEN.exec(xml);
    if (!match)
      throw new Error(`malformed at ${at}: ${xml.slice(at, at + 40)}`);
    const [, close, name, attrs, empty, text] = match;
    if (text !== undefined) {
      if (ENTITY.test(text)) throw new Error(`bad entity in ${text.trim()}`);
      if (stack.at(-1) === "loc") url.locs.push(text);
      else if (text.trim()) throw new Error(`text outside <loc>: ${text}`);
    } else if (close) {
      if (stack.pop() !== name) throw new Error(`</${name}> closes nothing`);
      if (name === "url") {
        if (url.locs.length !== 1) throw new Error("<url> without one <loc>");
        locs.push(url.locs[0]);
      }
    } else {
      const parent = stack.at(-1);
      if (parent === undefined) {
        roots += 1;
        if (name !== "urlset" || roots > 1) throw new Error(`root <${name}>`);
        if (!attrs.includes(`xmlns="${SITEMAP_NS}"`)) {
          throw new Error("<urlset> outside the sitemap namespace");
        }
      } else if (name === "url" && parent === "urlset") {
        url = { locs: [] };
      } else if (name === "loc" && parent === "url") {
        url.locs.push(...(empty ? [""] : []));
      } else if (parent !== "url") {
        throw new Error(`<${name}> inside <${parent}>`);
      }
      if (!empty) stack.push(name);
    }
  }
  if (roots !== 1 || stack.length > 0) throw new Error("unclosed or no root");
  return locs.map((loc) => loc.replaceAll("&amp;", "&"));
}

// A port per mode: the noindex run's server can outlive its stop() (it signals
// npx), and the index run must not be answered by it.
const server = await startServer(index ? 3307 : 3306);
const failures = [];

try {
  for (const path of PAGES) {
    const response = await fetch(`${server.origin}${path}`);
    const html = await response.text();
    const header = response.headers.get("x-robots-tag");
    const metas = [...html.matchAll(META)].map(([, content]) => content);
    const want = index ? "index, follow" : "noindex, nofollow";
    if (response.status !== 200) failures.push(`${path}: ${response.status}`);
    if (index ? header !== null : header !== "noindex, nofollow") {
      failures.push(`${path}: X-Robots-Tag ${header}`);
    }
    if (metas.length !== 1 || metas[0] !== want) {
      failures.push(
        `${path}: meta robots ${JSON.stringify(metas)}, want "${want}"`,
      );
    }
  }

  const robots = await (await fetch(`${server.origin}/robots.txt`)).text();
  const lines = robots.split("\n").map((line) => line.trim());
  const want = index
    ? [
        "Allow: /",
        "Disallow: /api/",
        "Sitemap: https://conaulicy.pl/sitemap.xml",
      ]
    : ["Disallow: /"];
  for (const line of want) {
    if (!lines.includes(line)) failures.push(`/robots.txt: no "${line}"`);
  }
  if (!index && /^Sitemap:/im.test(robots)) {
    failures.push("/robots.txt: names a sitemap");
  }
  if (index && lines.includes("Disallow: /")) {
    failures.push("/robots.txt: disallows everything");
  }

  if (index) {
    const response = await get(server.origin, "/adres/x?nr=1", {
      Host: "conaulicy.vercel.app",
    });
    const location = response.headers.location;
    if (
      response.statusCode !== 308 ||
      location !== "https://conaulicy.pl/adres/x?nr=1"
    ) {
      failures.push(
        `conaulicy.vercel.app/adres/x?nr=1: ${response.statusCode} → ${location}`,
      );
    }
  }

  for (const path of STATIC) {
    const html = await (await fetch(`${server.origin}${path}`)).text();
    const links = [...html.matchAll(CANONICAL)].map(([, href]) => href);
    // The root canonicalises with or without its slash; both are one URL.
    const want = path === "/" ? [SITE, `${SITE}/`] : [`${SITE}${path}`];
    if (links.length !== 1 || !want.includes(links[0])) {
      failures.push(`${path}: canonical ${JSON.stringify(links)}`);
    }
  }

  // Never indexed, links followed once indexable: the number-error page, a
  // place without data, search results (with the header too).
  const noindexWant = index ? "noindex, follow" : "noindex, nofollow";
  for (const path of [
    "/adres/0972447-90004?nr=",
    ROUTES.find((route) => route.name === "street-without-schedule").path,
    "/szukaj?q=adama",
  ]) {
    const response = await fetch(`${server.origin}${path}`);
    const metas = [...(await response.text()).matchAll(META)].map(
      ([, content]) => content,
    );
    if (metas.length !== 1 || metas[0] !== noindexWant) {
      failures.push(
        `${path}: meta robots ${JSON.stringify(metas)}, want "${noindexWant}"`,
      );
    }
    const header = response.headers.get("x-robots-tag");
    const headerWant = index ? "noindex" : "noindex, nofollow";
    if (path.startsWith("/szukaj") && header !== headerWant) {
      failures.push(`${path}: X-Robots-Tag ${header}, want ${headerWant}`);
    }
  }

  // Not found: the whole page in the raw HTML, never Next.js's empty error
  // shell, and one robots tag.
  for (const path of [
    "/nie-ma-takiej-strony",
    "/adres/9999999",
    "/adres/abc",
    "/adres/0972447-99999",
  ]) {
    const response = await fetch(`${server.origin}${path}`);
    const html = await response.text();
    const metas = [...html.matchAll(META)].map(([, content]) => content);
    const missing = [
      '<html lang="pl"',
      '<link rel="stylesheet"',
      '<h1 class="govuk-heading-l">Nie znaleziono strony</h1>',
      "<title>Nie znaleziono strony – conaulicy.pl</title>",
      'href="mailto:kontakt@conaulicy.pl"',
    ].filter((part) => !html.includes(part));
    if (
      response.status !== 404 ||
      missing.length > 0 ||
      html.includes("__next_error__") ||
      metas.length !== 1 ||
      metas[0] !== "noindex"
    ) {
      failures.push(
        `${path}: ${response.status}, missing ${JSON.stringify(missing)}, meta robots ${JSON.stringify(metas)}${html.includes("__next_error__") ? ", error shell" : ""}`,
      );
    }
  }

  const street = ROUTES.find((route) => route.name === "city-street").path;
  const streetHtml = await (await fetch(`${server.origin}${street}`)).text();
  const ics = /href="(\/ics\/[^"]+)"/.exec(streetHtml)?.[1];
  if (!ics) failures.push(`${street}: no /ics/ link`);
  const files = [
    [`${street}/harmonogram.pdf`, 200],
    // Schedule ended: check-pdf.mjs's 404.
    ["/adres/0972447-90009/harmonogram.pdf", 404],
    ...(ics ? [[ics, 200]] : []),
    ["/ics/nie-ma-takiej-strefy", 404],
  ];
  for (const [path, status] of files) {
    const response = await fetch(`${server.origin}${path}`);
    await response.arrayBuffer();
    const header = response.headers.get("x-robots-tag") ?? "";
    if (response.status !== status) {
      failures.push(`${path}: ${response.status}, want ${status}`);
    }
    if (!header.includes("noindex")) {
      failures.push(`${path}: X-Robots-Tag ${JSON.stringify(header)}`);
    }
  }

  const sitemap = await fetch(`${server.origin}/sitemap.xml`);
  const xml = await sitemap.text();
  const type = sitemap.headers.get("content-type") ?? "";
  if (sitemap.status !== 200) failures.push(`/sitemap.xml: ${sitemap.status}`);
  if (!/\bxml\b/.test(type)) failures.push(`/sitemap.xml: ${type}`);
  let locs = [];
  try {
    locs = sitemapLocs(xml);
  } catch (error) {
    failures.push(`/sitemap.xml: ${error.message}`);
  }
  if (!index && locs.length > 0) {
    failures.push(`/sitemap.xml: ${locs.length} URLs, want none`);
  }
  if (index) {
    // The places, from the index the running app links on the home page.
    const home = await (await fetch(`${server.origin}/`)).text();
    const indexUrl = /\/api\/search-index\/[\da-f]{16}/.exec(home)?.[0];
    const places = indexUrl
      ? await (await fetch(`${server.origin}${indexUrl}`)).json()
      : [];
    if (places.length === 0) failures.push("/: no search index");
    // Places without data: /ulice marks them, the sitemap leaves them out.
    const ulice = await (await fetch(`${server.origin}/ulice`)).text();
    const noData = new Set(
      [
        ...ulice.matchAll(
          /<a href="\/adres\/([^"]+)" class="govuk-link">[^<]*<\/a> \(brak danych\)/g,
        ),
      ].map(([, id]) => `${SITE}/adres/${id}`),
    );
    const withoutSchedule = `${SITE}${ROUTES.find((route) => route.name === "street-without-schedule").path}`;
    if (!noData.has(withoutSchedule)) {
      failures.push(`/ulice: ${withoutSchedule} not „(brak danych)”`);
    }
    const placeUrls = places
      .map(([id]) => `${SITE}/adres/${encodeURIComponent(id)}`)
      .filter((url) => !noData.has(url));
    const fixturePlaces = ROUTES.filter(
      (route) => /^\/adres\/[^/?]+$/.test(route.path) && !route.status,
    )
      .map((route) => `${SITE}${route.path}`)
      .filter((url) => !noData.has(url));
    for (const url of noData) {
      if (locs.includes(url)) failures.push(`/sitemap.xml: ${url} (no data)`);
    }
    const want = [...STATIC.map((path) => `${SITE}${path}`), ...placeUrls];
    const got = new Set(locs);
    if (got.size !== locs.length) failures.push("/sitemap.xml: duplicates");
    for (const loc of locs) {
      if (
        !loc.startsWith(`${SITE}/`) ||
        /\/nr\/|\/numer|\.pdf|\/ics\//.test(loc)
      ) {
        failures.push(`/sitemap.xml: ${loc}`);
      }
    }
    for (const url of [...want, ...fixturePlaces]) {
      if (!got.has(url)) failures.push(`/sitemap.xml: no ${url}`);
    }
    if (locs.length !== placeUrls.length + STATIC.length) {
      failures.push(
        `/sitemap.xml: ${locs.length} URLs, want ${places.length} places − ${noData.size} without data + ${STATIC.length}`,
      );
    }
    // Whether the build's copy carries the search index's `dataset` tag,
    // which POST /api/revalidate purges (information only).
    try {
      const meta = JSON.parse(
        readFileSync(".next/server/app/sitemap.xml.meta", "utf8"),
      );
      console.log(
        `/sitemap.xml cache tags: ${meta.headers?.["x-next-cache-tags"] ?? "(none)"}`,
      );
    } catch (error) {
      console.log(`/sitemap.xml cache tags: unreadable (${error.message})`);
    }
    console.log(
      `/sitemap.xml: ${locs.length} URLs (${places.length} places, ${noData.size} without data left out)`,
    );
  }
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  index
    ? `Indexing (${PAGES.join(", ")}): indexable, robots.txt open, vercel.app redirects, sitemap complete; PDF, ICS, /numer, no-data places, /szukaj noindex; 404s whole pages; canonicals.`
    : `Indexing (${PAGES.join(", ")}): noindex everywhere, robots.txt closed, sitemap empty; PDF, ICS noindex; 404s whole pages; canonicals.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
