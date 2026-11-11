// Checks each page's own metadata on the CI fixture (lib/share.ts): one
// non-empty <title> and description (≤ 160 characters) on every page in
// ROUTES, unique across pages, an address page and its waste subpage
// (/smieci) included (house-number variants, search results and 404s left
// out: they describe their street, or are never indexed); og:url is the
// canonical address, with the share image; the home page's WebSite JSON-LD
// parses. Every page in ROUTES, those included: the title is GOV.UK's
// "<H1> – conaulicy.pl", but a place's pages name its locality too:
// the address page "<H1>, <locality> – conaulicy.pl",
// every module's subpage "<H1> – <place>, <locality> – conaulicy.pl"
// ("Błąd: " first with an error summary). The share title is the same, and
// the share name conaulicy.pl. The home page's Apple web-app tags (a
// "default" status bar, never black-translucent) and the manifest's id,
// scope, start_url, display and icons. Structure only: no page's words are
// pinned here (its H1 and description need only exist).
//
// Runs against `next start` on the current build.
import { notFoundAt, ROUTES } from "../lib/server.mjs";

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

const titles = new Map();
const descriptions = new Map();

export async function check(server, failures) {
  for (const { path, status = 200 } of ROUTES) {
    // An unknown address: a 404 on its first answer (notFoundAt,
    // scripts/lib/server.mjs), then checked as any page.
    if (status === 404 && path.startsWith("/adres/")) {
      const wrong = await notFoundAt(`${server.origin}${path}`);
      if (wrong) failures.push(`${path}: ${wrong}`);
    }
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
    // A subpage: its h1, then its place (the breadcrumb before it), then
    // the locality; the address page: its h1, then the locality.
    const subpage = /^\/adres\/[^/]+\/(smieci|woda|prad)(?:\?|$)/.exec(
      path,
    )?.[1];
    const place = subpage
      ? decode(
          all(
            html,
            /<a class="govuk-breadcrumbs__link" href="[^"]*">([^<]*)<\/a>/g,
          ).at(-1) ?? "",
        )
      : null;
    const hub = /^\/adres\/[^/?]+(?:\?|$)/.test(path) && status === 200;
    const prefix = subpage
      ? `${error}${h1[0]} – ${place}, `
      : `${error}${h1[0]}, `;
    const ok =
      subpage || hub
        ? title[0]?.startsWith(prefix) &&
          title[0].endsWith(" – conaulicy.pl") &&
          title[0].length > prefix.length + " – conaulicy.pl".length
        : title[0] === `${error}${h1[0]} – conaulicy.pl`;
    if (h1.length !== 1 || !h1[0] || !ok) {
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
      /^\/adres\/[^/]+\/(?!smieci$)[^/?]+/.test(route.path)
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

  // The home-screen app: Apple's title and a "default" status
  // bar, never black-translucent; the manifest's identity and icons.
  const home = await (await fetch(`${server.origin}/`)).text();
  for (const [name, want] of [
    ["apple-mobile-web-app-status-bar-style", "default"],
    ["apple-mobile-web-app-title", "conaulicy.pl"],
  ]) {
    const got = meta(home, "name", name);
    if (got.length !== 1 || got[0] !== want)
      failures.push(`/: ${name} ${JSON.stringify(got)}, want ${want}`);
  }
  if (home.includes("black-translucent"))
    failures.push("/: black-translucent in the HTML");
  const manifest = await (
    await fetch(`${server.origin}/manifest.webmanifest`)
  ).json();
  for (const [key, want] of [
    ["id", "/"],
    ["scope", "/"],
    ["start_url", "/"],
    ["display", "standalone"],
  ]) {
    if (manifest[key] !== want)
      failures.push(`manifest: ${key} ${JSON.stringify(manifest[key])}`);
  }
  const icons = manifest.icons ?? [];
  const any = (size) =>
    icons.some((icon) => icon.sizes === size && icon.purpose !== "maskable");
  if (!any("192x192") || !any("512x512"))
    failures.push("manifest: no 192x192 and 512x512 icons (purpose any)");
  if (icons.filter((icon) => icon.purpose === "maskable").length !== 1)
    failures.push("manifest: not one maskable icon");
  for (const { src } of icons) {
    const response = await fetch(`${server.origin}${src}`);
    if (
      response.status !== 200 ||
      response.headers.get("content-type") !== "image/png"
    )
      failures.push(
        `manifest icon ${src}: ${response.status} ${response.headers.get("content-type")}`,
      );
  }
  return `Metadata: ${ROUTES.length} pages titled "<H1> – conaulicy.pl" (a place's with its locality); ${titles.size} with their own title and description.`;
}
