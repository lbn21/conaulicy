// Checks each page's own metadata on the CI fixture (lib/share.ts): one
// non-empty <title> and description (≤ 160 characters) on every page in
// ROUTES, unique across pages (house-number variants, search results and
// 404s left out: they describe their street, or are never indexed); og:url
// is the canonical address, with the share image; the home page's WebSite
// JSON-LD parses. Every page in ROUTES, those included: the title is GOV.UK's
// "<H1> – conaulicy.pl" ("Błąd: " first with an error summary), the share
// title the same, and the share name conaulicy.pl.
//
// Runs against `next start` on the current build.
import { ROUTES, startServer } from "./lib/server.mjs";

const SITE = "https://conaulicy.pl";
const STATIC = ["/", "/ulice", "/dostepnosc", "/prywatnosc", "/o-projekcie"];

const all = (html, pattern) => [...html.matchAll(pattern)].map(([, v]) => v);
const decode = (text) =>
  text
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const meta = (html, attr, name) =>
  all(html, new RegExp(`<meta ${attr}="${name}" content="([^"]*)"\\/?>`, "g"));

const server = await startServer(3309);
const failures = [];
const titles = new Map();
const descriptions = new Map();

try {
  for (const { path, status = 200 } of ROUTES) {
    const response = await fetch(`${server.origin}${path}`);
    const html = await response.text();
    if (response.status !== status) {
      failures.push(`${path}: ${response.status}, want ${status}`);
    }
    const h1 = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g).map((text) =>
      decode(text.replace(/<[^>]*>/g, "")).trim(),
    );
    const title = all(html, /<title>([^<]*)<\/title>/g).map(decode);
    const error = html.includes('class="govuk-error-summary"') ? "Błąd: " : "";
    if (h1.length !== 1 || title[0] !== `${error}${h1[0]} – conaulicy.pl`) {
      failures.push(
        `${path}: title ${JSON.stringify(title)}, H1 ${JSON.stringify(h1)}`,
      );
    }
    const ogTitle = meta(html, "property", "og:title").map(decode);
    if (ogTitle.length > 1 || (ogTitle[0] ?? title[0]) !== title[0]) {
      failures.push(`${path}: og:title ${JSON.stringify(ogTitle)}`);
    }
    const siteName = meta(html, "property", "og:site_name");
    if (siteName.length !== 1 || siteName[0] !== "conaulicy.pl") {
      failures.push(`${path}: og:site_name ${JSON.stringify(siteName)}`);
    }
  }

  for (const route of ROUTES) {
    if (
      route.status ||
      route.path.includes("?nr") ||
      route.path.startsWith("/szukaj")
    )
      continue;
    const { path } = route;
    const response = await fetch(`${server.origin}${path}`);
    const html = await response.text();
    if (response.status !== 200) failures.push(`${path}: ${response.status}`);

    const title = all(html, /<title>([^<]*)<\/title>/g).map(decode);
    const description = meta(html, "name", "description").map(decode);
    if (title.length !== 1 || !title[0].trim()) {
      failures.push(`${path}: <title> ${JSON.stringify(title)}`);
    }
    if (description.length !== 1 || !description[0].trim()) {
      failures.push(`${path}: description ${JSON.stringify(description)}`);
    } else if (description[0].length > 160) {
      failures.push(`${path}: description ${description[0].length} > 160`);
    }
    for (const [seen, value] of [
      [titles, title[0]],
      [descriptions, description[0]],
    ]) {
      if (seen.has(value))
        failures.push(`${path}: same as ${seen.get(value)}: ${value}`);
      seen.set(value, path);
    }

    const ogUrl = meta(html, "property", "og:url");
    const want = path === "/" ? [SITE, `${SITE}/`] : [`${SITE}${path}`];
    if (ogUrl.length !== 1 || !want.includes(ogUrl[0])) {
      failures.push(`${path}: og:url ${JSON.stringify(ogUrl)}`);
    }
    if (STATIC.includes(path)) {
      const canonical = all(html, /<link rel="canonical" href="([^"]*)"\/?>/g);
      if (canonical[0] !== ogUrl[0]) {
        failures.push(
          `${path}: og:url ${ogUrl[0]} ≠ canonical ${canonical[0]}`,
        );
      }
    }
    if (meta(html, "property", "og:image").length === 0) {
      failures.push(`${path}: no og:image`);
    }
    const ogDescription = meta(html, "property", "og:description").map(decode);
    if (ogDescription.length !== 1 || ogDescription[0] !== description[0]) {
      failures.push(`${path}: og:description ${JSON.stringify(ogDescription)}`);
    }

    const jsonLd = all(
      html,
      /<script type="application\/ld\+json">([^<]*)<\/script>/g,
    );
    if (path === "/") {
      try {
        const data = JSON.parse(jsonLd[0] ?? "");
        if (data["@type"] !== "WebSite" || data.url !== `${SITE}/`) {
          failures.push(`/: JSON-LD ${jsonLd[0]}`);
        }
      } catch {
        failures.push(`/: JSON-LD ${JSON.stringify(jsonLd)}`);
      }
    } else if (jsonLd.length > 0) {
      failures.push(`${path}: JSON-LD outside the home page`);
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
  `Metadata: ${ROUTES.length} pages titled "<H1> – conaulicy.pl"; ${titles.size} with their own title and description.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
