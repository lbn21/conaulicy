// Checks what search engines are told (lib/indexing.ts), per build:
//   --expect=noindex  a normal CI build: X-Robots-Tag and meta robots say
//                     noindex, nofollow; robots.txt disallows everything.
//   --expect=index    a production-like build (VERCEL_ENV=production, no
//                     SITE_BASIC_AUTH): no X-Robots-Tag, meta robots says
//                     index, follow; robots.txt allows all but /api/ and
//                     names the sitemap; conaulicy.vercel.app redirects (308)
//                     to conaulicy.pl, path and query kept.
//
// Runs against `next start` on the current build and the CI fixture.
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
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  index
    ? `Indexing (${PAGES.join(", ")}): indexable, robots.txt open, vercel.app redirects.`
    : `Indexing (${PAGES.join(", ")}): noindex everywhere, robots.txt closed.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
