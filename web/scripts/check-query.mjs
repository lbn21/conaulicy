// Unknown query parameters redirect (308) to the clean URL, so random query
// strings cannot bust the CDN cache (proxy.ts, lib/clean-query.ts). Allowed
// ones (nr on street pages and PDFs, q on /api/search) are
// served as they are; Next.js assets, icons with their cache-busting query,
// other files and POST /api/revalidate are never redirected. The Apple icon
// is linked at the root with no query, and served as a PNG.
//
// Also the search (components/address-search.tsx): the home page's raw
// HTML holds a form with the library's field (a combobox named q, empty, no
// error) and a submit button; /szukaj is gone (task 227), a plain 404. A
// suggestion's text, as a pick leaves it in the field, resolves to its own
// place (lib/search-submit.ts, as „Szukaj” does): every label in
// /api/search-index, and some with a house number.
//
// A renamed street's old id (place_redirects; the CI fixture's made-up
// 0972447-99999) answers 308 on every address under it, query kept, with
// exactly one Location (the ?nr= ones from proxy.ts); an unknown id stays a
// 404, with or without a number.
//
// Runs against `next start` on the current build and the CI fixture.
import { withHouseNumber } from "../lib/house.ts";
import { matcher } from "../lib/search.ts";
import { placeTarget } from "../lib/search-submit.ts";
import {
  fetchJson,
  finish,
  notFoundAt,
  searchIndexOf,
  startServer,
} from "./lib/server.mjs";

const STREET = "/adres/0972447-00470";
const SPLIT = "/adres/0972447-90004";
const RENAMED = "/adres/0972447-99999";

// [method, path, status, clean path + query for a redirect, user agent].
const CASES = [
  ["GET", `${STREET}?x=1`, 308, STREET],
  ["GET", `${STREET}?nr=12&x=1`, 308, `${STREET}?nr=12`],
  ["GET", `${STREET}?nr=12`, 200],
  ["GET", `${SPLIT}?nr=`, 200],
  [
    "GET",
    `${SPLIT}/harmonogram.pdf?nr=7a&x=1`,
    308,
    `${SPLIT}/harmonogram.pdf?nr=7a`,
  ],
  ["GET", `${STREET}/harmonogram.pdf?x=1`, 308, `${STREET}/harmonogram.pdf`],
  ["GET", "/api/search?q=asn", 200],
  ["GET", "/api/search?q=asn&x=1", 308, "/api/search?q=asn"],
  ["GET", "/api/place-redirects", 200],
  ["GET", "/api/place-redirects?x=1", 308, "/api/place-redirects"],
  ["GET", "/?fbclid=1", 308, "/"],
  ["HEAD", "/ulice?utm_source=fb", 308, "/ulice"],
  ["POST", "/api/revalidate?x=1", 401],
  ["GET", "/manifest.webmanifest?x=1", 200],
  ["GET", "/robots.txt?x=1", 200],
  // The search page is gone: no redirect (task 227).
  ["GET", "/szukaj?q=Rynek", 404],
  ["GET", RENAMED, 308, STREET],
  ["GET", `${RENAMED}?nr=12`, 308, `${STREET}?nr=12`],
  ["GET", `${RENAMED}?nr=`, 308, `${STREET}?nr=`],
  [
    "GET",
    `${RENAMED}/harmonogram.pdf?nr=12`,
    308,
    `${STREET}/harmonogram.pdf?nr=12`,
  ],
  ["GET", "/adres/0972447-88888", 404],
  ["GET", "/adres/0972447-88888?nr=12", 404],
  // A module subpage (lib/address-routes.ts): the street page's rules.
  ["GET", `${STREET}/smieci?x=1`, 308, `${STREET}/smieci`],
  ["GET", `${STREET}/smieci?nr=12&x=1`, 308, `${STREET}/smieci?nr=12`],
  ["GET", `${STREET}/smieci?nr=12`, 200],
  ["GET", `${SPLIT}/smieci?nr=`, 200],
  ["GET", `${RENAMED}/smieci`, 308, `${STREET}/smieci`],
  ["GET", `${RENAMED}/smieci?nr=12`, 308, `${STREET}/smieci?nr=12`],
  ["GET", "/adres/0972447-88888/smieci", 404],
  ["GET", "/adres/0972447-88888/smieci?nr=12", 404],
  ["GET", `${STREET}/nie-ma-takiego-modulu`, 404],
  // A module without a subpage (the weather): a 404, its query untouched.
  ["GET", `${STREET}/pogoda`, 404],
  ["GET", `${STREET}/pogoda?nr=12`, 404],
  ["GET", "/api/place-redirects", 200],
];

// [query, the one place „Szukaj” opens (its page, with the house number)]. Every label in the index, and some with a number, are
// added below.
const LANDS = [
  ["Rynek", "/adres/0972447-19253"],
  ["asnyka 12", "/adres/0972447-00470?nr=12"],
  ["ul. Rynek, Lubaczów", "/adres/0972447-19253"],
  // A house number where the field puts it, or typed after a pick.
  ["ul. Rynek 5, Lubaczów", "/adres/0972447-19253?nr=5"],
  ["ul. Rynek, Lubaczów 5", "/adres/0972447-19253?nr=5"],
  ["ul. Adama Asnyka 12, Lubaczów", "/adres/0972447-00470?nr=12"],
  ["ul. Adama Asnyka, Lubaczów 12", "/adres/0972447-00470?nr=12"],
  ["asn", "/adres/0972447-00470"],
];

const server = await startServer(3308);
const failures = [];

try {
  const home = await (await fetch(`${server.origin}/`)).text();
  const chunk = /\/_next\/static\/[^"]+\.js/.exec(home)?.[0];
  if (chunk) CASES.push(["GET", `${chunk}?x=1`, 200]);
  else failures.push("/: no /_next/static/ script");

  // Next.js links its tab icons with a cache-busting query.
  const links = home.match(/<link [^>]*>/g) ?? [];
  const hrefs = (rel) =>
    links
      .filter((tag) => new RegExp(`rel="${rel}"`).test(tag))
      .map((tag) => /href="([^"]+)"/.exec(tag)?.[1]);
  for (const name of ["favicon.ico", "icon.svg"]) {
    const icon = hrefs("icon").find((href) => href?.startsWith(`/${name}?`));
    if (icon) CASES.push(["GET", icon, 200]);
    else failures.push(`/: no <link> to /${name}?…`);
  }
  // The Apple icon at the root, with no query (task 136): iOS fetches it
  // there, without cookies, when the page is added to the Home Screen.
  const apple = hrefs("apple-touch-icon");
  if (apple.length !== 1 || apple[0] !== "/apple-touch-icon.png")
    failures.push(`/: apple-touch-icon ${JSON.stringify(apple)}`);
  if (links.some((tag) => tag.includes('href="/apple-icon.png')))
    failures.push("/: a <link> to /apple-icon.png");
  const touch = await fetch(`${server.origin}/apple-touch-icon.png`);
  if (touch.status !== 200 || touch.headers.get("content-type") !== "image/png")
    failures.push(
      `/apple-touch-icon.png: ${touch.status} ${touch.headers.get("content-type")}`,
    );

  const { places } = await searchIndexOf(server.origin, home);
  if (places.length === 0) failures.push("/: no search index");
  for (const [i, [id, label]] of places.entries()) {
    const href = `/adres/${encodeURIComponent(id)}`;
    LANDS.push([label, href]);
    // Every third with a house number, as the field writes it or as typed
    // after a pick.
    if (i % 3 === 0) {
      for (const text of [withHouseNumber(label, "7a"), `${label} 7a`])
        LANDS.push([text, `${href}?nr=7a`]);
    }
  }

  const form = /<form[^>]*>[\s\S]*?<\/form>/.exec(home)?.[0] ?? "";
  const field = /<input[^>]*\sname="q"[^>]*>/.exec(form)?.[0] ?? "";
  for (const part of [
    /\srole="combobox"/.test(field),
    /\sid="adres"/.test(field),
    /\svalue=""/.test(field),
    !/govuk-input--error/.test(field),
    !/govuk-form-group--error|govuk-error-message/.test(form),
    form.includes('<button type="submit" class="govuk-button"'),
  ]) {
    if (!part) failures.push(`/: search form ${JSON.stringify(form)}`);
  }
  const index = { places, match: matcher(places) };
  for (const [q, to] of LANDS) {
    const at = placeTarget(index, q);
    if ((at && decodeURI(at)) !== to)
      failures.push(`"${q}": opens ${at}, want ${to}`);
  }

  // The calendar link is on the waste subpage (the address page has none).
  const street = await (await fetch(`${server.origin}${STREET}/smieci`)).text();
  const ics = /href="(\/ics\/[^"?]+)"/.exec(street)?.[1];
  if (ics) CASES.push(["GET", `${ics}?x=1`, 308, ics]);
  else failures.push(`${STREET}/smieci: no /ics/ link`);

  for (const [method, path, status, clean, ua] of CASES) {
    // An unknown address: notFoundAt's rule (scripts/lib/server.mjs).
    if (status === 404 && path.startsWith("/adres/")) {
      const wrong = await notFoundAt(`${server.origin}${path}`);
      if (wrong) failures.push(`${method} ${path}: ${wrong}`);
      continue;
    }
    const response = await fetch(`${server.origin}${path}`, {
      method,
      redirect: "manual",
      headers: ua ? { "user-agent": ua } : {},
    });
    await response.arrayBuffer();
    const location = response.headers.get("location");
    const at = location && new URL(location, server.origin);
    const got =
      at &&
      `${at.origin === server.origin ? "" : at.origin}${at.pathname}${at.search}`;
    if (response.status !== status || (clean ?? null) !== (got ?? null)) {
      failures.push(
        `${method} ${path}: ${response.status} → ${location}, want ${status}${clean ? ` → ${clean}` : ""}`,
      );
    }
    if (path === "/api/search?q=asn" && response.status === 200) {
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("json")) failures.push(`${path}: ${type}`);
    }
  }
  const moved = await fetchJson(`${server.origin}/api/place-redirects`);
  if (moved["0972447-99999"] !== "0972447-00470") {
    failures.push(`/api/place-redirects: ${JSON.stringify(moved)}`);
  }
} finally {
  server.stop();
}

finish(
  failures,
  `Query parameters: ${CASES.length} cases; unknown ones redirect to the clean URL, allowed ones and assets served.`,
);
