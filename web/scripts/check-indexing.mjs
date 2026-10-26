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
// those /ulice marks „(brak danych)”, each with its waste subpage
// (/adres/<id>/smieci, canonical itself), nothing else. The address page and
// /smieci canonicalise to themselves, ?nr= (and its /nr/… path) left out. PDFs and calendars send
// X-Robots-Tag: noindex; the number-error page (/numer), a place without
// data and /szukaj have meta robots noindex (/szukaj the header too); the
// static pages have one canonical link each (the home page's as the
// sitemap has it, no trailing slash). Indexable: every URL in the sitemap
// answers 200 with no noindex (meta or X-Robots-Tag), canonicalises to
// itself, and has a title of its own. 404s (an unknown path, unknown
// addresses) are whole pages in the raw HTML, no JS needed: status 404, the
// layout (lang, stylesheet), GOV.UK's "page not found" H1, its link home
// („Przejdź na stronę główną”), robots meta noindex (one or more tags, every
// one noindex, none index), and no description; an unknown module
// (/adres/<id>/<slug>) and one without a subpage (/pogoda) too.
//
// Runs against `next start` on the current build and the CI fixture.
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { finish, ROUTES, searchIndexOf, startServer } from "./lib/server.mjs";

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
// A robots tag that says noindex and never index.
const noindexOnly = (content) => {
  const directives = content.split(",").map((part) => part.trim());
  return directives.includes("noindex") && !directives.includes("index");
};

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
    // The root without its slash, as the sitemap lists it.
    const want = path === "/" ? SITE : `${SITE}${path}`;
    if (links.length !== 1 || links[0] !== want) {
      failures.push(`${path}: canonical ${JSON.stringify(links)}`);
    }
  }

  // The address page and its waste subpage canonicalise to themselves, a
  // house number left out (lib/modules.ts).
  for (const name of ["city-street", "village", "split-street"]) {
    const place = ROUTES.find((route) => route.name === name).path;
    for (const [path, want] of [
      [place, place],
      [`${place}?nr=7a`, place],
      [`${place}/smieci`, `${place}/smieci`],
      [`${place}/smieci?nr=7a`, `${place}/smieci`],
      // The rewritten paths themselves, and a number with a slash.
      [`${place}/nr/5`, place],
      [`${place}/smieci/nr/5`, `${place}/smieci`],
      [`${place}/smieci?nr=7/22`, `${place}/smieci`],
    ]) {
      const html = await (await fetch(`${server.origin}${path}`)).text();
      const links = [...html.matchAll(CANONICAL)].map(([, href]) => href);
      if (links.length !== 1 || links[0] !== `${SITE}${want}`) {
        failures.push(`${path}: canonical ${JSON.stringify(links)}`);
      }
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
  // shell, and noindex. Next.js 16.4 emits its own noindex on a 404, and on a
  // cached dynamic 404 that is regenerated (ISR, after 10 minutes) it emits
  // a second one: harmless, both say noindex. So one or more tags, every one
  // noindex, none index.
  for (const path of [
    "/nie-ma-takiej-strony",
    "/adres/9999999",
    "/adres/abc",
    "/adres/0972447-99999",
    // An unknown module, with and without a number; a module of an unknown
    // place.
    "/adres/0972447-00470/nie-ma-takiego-modulu",
    "/adres/0972447-00470/nie-ma-takiego-modulu/nr/12",
    "/adres/0972447-00470/nie-ma-takiego-modulu/numer",
    "/adres/9999999/smieci",
    // A module without a subpage (the weather).
    "/adres/0972447-00470/pogoda",
    "/adres/0972447-00470/pogoda/nr/12",
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
      '<a href="/" class="govuk-link">Przejdź na stronę główną</a>',
    ].filter((part) => !html.includes(part));
    if (
      response.status !== 404 ||
      missing.length > 0 ||
      html.includes('<meta name="description"') ||
      html.includes("__next_error__") ||
      metas.length === 0 ||
      !metas.every(noindexOnly)
    ) {
      failures.push(
        `${path}: ${response.status}, missing ${JSON.stringify(missing)}, meta robots ${JSON.stringify(metas)}${html.includes("__next_error__") ? ", error shell" : ""}${html.includes('<meta name="description"') ? ", a description" : ""}`,
      );
    }
  }

  const street = ROUTES.find((route) => route.name === "city-street").path;
  const streetHtml = await (
    await fetch(`${server.origin}${street}/smieci`)
  ).text();
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
    const { places } = await searchIndexOf(server.origin, home);
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
      .filter((url) => !noData.has(url))
      .flatMap((url) => [url, `${url}/smieci`]);
    const fixturePlaces = ROUTES.filter(
      (route) => /^\/adres\/[^/?]+$/.test(route.path) && !route.status,
    )
      .map((route) => `${SITE}${route.path}`)
      .filter((url) => !noData.has(url));
    for (const url of noData) {
      for (const page of [url, `${url}/smieci`]) {
        if (locs.includes(page)) {
          failures.push(`/sitemap.xml: ${page} (no data)`);
        }
      }
    }
    const want = [
      ...STATIC.map((path) => (path === "/" ? SITE : `${SITE}${path}`)),
      ...placeUrls,
    ];
    const got = new Set(locs);
    if (got.size !== locs.length) failures.push("/sitemap.xml: duplicates");
    for (const loc of locs) {
      if (
        (loc !== SITE && !loc.startsWith(`${SITE}/`)) ||
        /\/nr\/|\/numer|\.pdf|\/ics\/|\/adres\/[^/]+\/(?!smieci$)[^/]/.test(loc)
      ) {
        failures.push(`/sitemap.xml: ${loc}`);
      }
    }
    for (const url of [...want, ...fixturePlaces]) {
      if (!got.has(url)) failures.push(`/sitemap.xml: no ${url}`);
    }
    if (locs.length !== placeUrls.length + STATIC.length) {
      failures.push(
        `/sitemap.xml: ${locs.length} URLs, want 2 × (${places.length} places − ${noData.size} without data) + ${STATIC.length}`,
      );
    }
    // Every URL listed is indexable: 200, no noindex anywhere, canonical
    // itself; and no two share a title (a street name in two places reads
    // differently: components/place-page.tsx).
    const titles = new Map();
    for (const loc of locs) {
      const path = loc.slice(SITE.length) || "/";
      const response = await fetch(`${server.origin}${path}`);
      const html = await response.text();
      const header = response.headers.get("x-robots-tag") ?? "";
      const metas = [...html.matchAll(META)].map(([, content]) => content);
      const links = [...html.matchAll(CANONICAL)].map(([, href]) => href);
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
      if (
        response.status !== 200 ||
        header.includes("noindex") ||
        metas.some((content) => content.includes("noindex")) ||
        links.length !== 1 ||
        links[0] !== loc
      ) {
        failures.push(
          `${loc}: ${response.status}, X-Robots-Tag ${JSON.stringify(header)}, meta robots ${JSON.stringify(metas)}, canonical ${JSON.stringify(links)}`,
        );
      }
      if (!title || titles.has(title)) {
        failures.push(`${loc}: title ${title} as ${titles.get(title)}`);
      }
      titles.set(title, loc);
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

finish(
  failures,
  index
    ? `Indexing (${PAGES.join(", ")}): indexable, robots.txt open, vercel.app redirects, sitemap complete, every URL in it indexable with its own title; PDF, ICS, /numer, no-data places, /szukaj noindex; 404s whole pages; canonicals.`
    : `Indexing (${PAGES.join(", ")}): noindex everywhere, robots.txt closed, sitemap empty; PDF, ICS noindex; 404s whole pages; canonicals.`,
);
