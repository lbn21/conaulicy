// Query strings change nothing: every page and file is prerendered whole,
// and a query never reaches a function (no proxy.ts, no searchParams), so
// a known address with any query (?x=1, ?nr=12, ?utm_source=…) is the same
// 200, never a redirect; Next.js assets and icons with their cache-busting
// query are served; POST /api/revalidate without its secret is a 401. The
// Apple icon is linked at the root with no query, and served as a PNG.
//
// Also the search (components/address-search.tsx): the home page's raw
// HTML holds a form with the library's field (a combobox named q, empty, no
// error) and a submit button; /szukaj is gone, a plain 404. A
// suggestion's text, as a pick leaves it in the field, resolves to its own
// place (lib/search-submit.ts, as „Szukaj” does): every label in the
// search index; a house number typed after it is ignored.
//
// A renamed street's old id (place_redirects; the CI fixture's made-up
// 0972447-99999) answers 308 on every address under it, from the build's
// redirects (next.config.ts); an unknown id, or anything after an id that
// is no subpage or file, is the prerendered 404 (dynamicParams = false);
// fresh paths each run, so no earlier answer is cached.
//
// Runs against `next start` on the current build and the CI fixture.
import { matcher } from "../../lib/search.ts";
import { placeTarget } from "../../lib/search-submit.ts";
import { notFoundAt, searchIndexOf } from "../lib/server.mjs";

const STREET = "/adres/0972447-00470";
const RENAMED = "/adres/0972447-99999";
// Digits, so a made-up id looks like a real one (TERYT's).
const FRESH = String(Date.now());

// [method, path, status, redirect target, user agent].
const CASES = [
  ["GET", `${STREET}?x=1`, 200],
  ["GET", `${STREET}?nr=12`, 200],
  ["GET", `${STREET}?utm_source=fb`, 200],
  ["GET", `${STREET}/harmonogram.pdf?x=1`, 200],
  ["GET", `${STREET}/smieci?nr=12`, 200],
  ["GET", "/?fbclid=1", 200],
  ["HEAD", "/ulice?utm_source=fb", 200],
  ["POST", "/api/revalidate?x=1", 401],
  ["GET", "/manifest.webmanifest?x=1", 200],
  ["GET", "/robots.txt?x=1", 200],
  ["GET", "/search-index.json?x=1", 200],
  // The search page and the old APIs are gone: no redirect.
  ["GET", "/szukaj?q=Rynek", 404],
  ["GET", "/api/search?q=asn", 404],
  ["GET", "/api/places", 404],
  ["GET", RENAMED, 308, STREET],
  ["GET", `${RENAMED}/harmonogram.pdf`, 308, `${STREET}/harmonogram.pdf`],
  ["GET", `${RENAMED}/smieci`, 308, `${STREET}/smieci`],
  ["GET", `${RENAMED}/woda.ics`, 308, `${STREET}/woda.ics`],
  ["GET", "/adres/0972447-88888", 404],
  ["GET", "/adres/0972447-88888?nr=12", 404],
  ["GET", "/adres/0972447-88888/smieci", 404],
  ["GET", `${STREET}/nie-ma-takiego-modulu`, 404],
  // No weather subpage: a 404 like any unknown module.
  ["GET", `${STREET}/pogoda`, 404],
  // Never asked before (fresh each run), and an unknown id's files.
  ["GET", `${STREET}/x${FRESH}`, 404],
  ["GET", `/adres/0972447-8${FRESH.slice(-4)}`, 404],
  ["GET", `/adres/0606${FRESH.slice(-3)}9/woda`, 404],
  ["GET", `/adres/x${FRESH}`, 404],
  ["GET", "/adres/0972447-88888/harmonogram.pdf", 404],
  ["GET", "/adres/0972447-88888/woda.ics", 404],
  ["GET", `/adres/0606${FRESH.slice(-3)}9/prad`, 404],
  ["GET", `${STREET}/prad.ics`, 404],
  ["GET", "/ics/nie-ma-takiej-strefy", 404],
  ["GET", "/podglad/imgw/nie-ma-takiego", 404],
];

// [query, the one place „Szukaj” opens]. Every label in the index is added
// below.
const LANDS = [
  ["Rynek", "/adres/0972447-19253"],
  ["asnyka 12", "/adres/0972447-00470"],
  ["ul. Rynek, Lubaczów", "/adres/0972447-19253"],
  ["ul. Rynek, Lubaczów 5", "/adres/0972447-19253"],
  ["asn", "/adres/0972447-00470"],
];

export async function check(server, failures) {
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
  // The Apple icon at the root, with no query: iOS fetches it
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
    // A house number typed after a pick: the same place.
    if (i % 3 === 0) LANDS.push([`${label} 7a`, href]);
  }

  const form = /<form[^>]*>[\s\S]*?<\/form>/.exec(home)?.[0] ?? "";
  const field = /<input[^>]*\sname="q"[^>]*>/.exec(form)?.[0] ?? "";
  for (const part of [
    /\srole="combobox"/.test(field),
    /\sid="adres"/.test(field),
    /\svalue=""/.test(field),
    !/govuk-input--error/.test(field),
    !/govuk-form-group--error|govuk-error-message/.test(form),
    // GOV.UK's button, in the brand's modifier on the hero (t390).
    /<button type="submit" class="govuk-button(?: [\w-]+)*"/.test(form),
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
  if (ics) CASES.push(["GET", `${ics}?x=1`, 200]);
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
  }
  return `Query parameters: ${CASES.length} cases; any query served as the page, renames 308, unknown 404.`;
}
