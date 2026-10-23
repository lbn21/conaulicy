// Unknown query parameters redirect (308) to the clean URL, so random query
// strings cannot bust the CDN cache (proxy.ts, lib/clean-query.ts). Allowed
// ones (nr on street pages and PDFs, q on /api/search and /szukaj) are
// served as they are; Next.js assets, icons with their cache-busting query,
// other files and POST /api/revalidate are never redirected.
//
// Also the search without JS: the home page's raw HTML is a GET form to
// /szukaj with a field named q and a submit button, and /szukaj answers it:
// one place redirects (308, never stored) to its page with the house number,
// several are listed, none says what to try, an empty q is GOV.UK's error.
// /szukaj's field is the home page's (components/address-search.tsx): the
// same <search> markup, holding what was searched for, or GOV.UK's error
// markup for an empty q, between the H1 and the results.
// A suggestion's text, as a pick leaves it in the field, opens its own
// place: every label in /api/search-index, and some with a house number.
//
// A renamed street's old id (place_redirects; the CI fixture's made-up
// 0972447-99999) answers 308 on every address under it, query kept, with
// exactly one Location (the ?nr= ones from proxy.ts); an unknown id stays a
// 404, with or without a number.
//
// Runs against `next start` on the current build and the CI fixture.
import { withHouseNumber } from "../lib/house.ts";
import { startServer } from "./lib/server.mjs";

const escapeHtml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STREET = "/adres/0972447-00470";
const SPLIT = "/adres/0972447-90004";
const RENAMED = "/adres/0972447-99999";

// [method, path, status, clean path + query for a redirect]
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
  ["GET", "/?fbclid=1", 308, "/"],
  ["HEAD", "/ulice?utm_source=fb", 308, "/ulice"],
  ["POST", "/api/revalidate?x=1", 401],
  ["GET", "/manifest.webmanifest?x=1", 200],
  ["GET", "/robots.txt?x=1", 200],
  ["GET", "/szukaj?q=Rynek", 308, "/adres/0972447-19253"],
  ["GET", "/szukaj?q=asnyka%2012", 308, "/adres/0972447-00470?nr=12"],
  [
    "GET",
    `/szukaj?q=${encodeURIComponent("ul. Rynek, Lubaczów")}`,
    308,
    "/adres/0972447-19253",
  ],
  // A house number where the field puts it, or typed after a pick.
  ...[
    ["ul. Rynek 5, Lubaczów", "/adres/0972447-19253?nr=5"],
    ["ul. Rynek, Lubaczów 5", "/adres/0972447-19253?nr=5"],
    ["ul. Adama Asnyka 12, Lubaczów", "/adres/0972447-00470?nr=12"],
    ["ul. Adama Asnyka, Lubaczów 12", "/adres/0972447-00470?nr=12"],
  ].map(([q, to]) => ["GET", `/szukaj?q=${encodeURIComponent(q)}`, 308, to]),
  ["GET", "/szukaj?q=adama", 200],
  ["GET", "/szukaj?q=xyzqq", 200],
  ["GET", "/szukaj?q=", 200],
  ["GET", "/szukaj?q=Rynek&utm_source=x", 308, "/szukaj?q=Rynek"],
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
  ["GET", "/api/place-redirects", 200],
];

// [query, what the raw HTML of /szukaj must hold]
const SEARCH = [
  [
    "adama",
    [
      '<h1 class="govuk-heading-l">Wyniki wyszukiwania</h1>',
      "znaleźliśmy 2 adresy",
      'href="/adres/0972447-00470"',
      'href="/adres/0972447-12740"',
      'value="adama"',
    ],
  ],
  [
    "xyzqq",
    [
      '<h1 class="govuk-heading-l">Brak wyników</h1>',
      "Nie znaleźliśmy „xyzqq”.",
      '<a href="/ulice" class="govuk-link">Wszystkie ulice i wsie</a>',
      'value="xyzqq"',
    ],
  ],
  [
    "",
    [
      "<title>Błąd: Wyszukaj adres – conaulicy.pl</title>",
      'class="govuk-error-summary"',
      'href="#adres">Wpisz nazwę ulicy albo wsi</a>',
      'class="govuk-error-message"',
      "govuk-input--error",
    ],
  ],
];

const server = await startServer(3308);
const failures = [];

try {
  const home = await (await fetch(`${server.origin}/`)).text();
  const chunk = /\/_next\/static\/[^"]+\.js/.exec(home)?.[0];
  if (chunk) CASES.push(["GET", `${chunk}?x=1`, 200]);
  else failures.push("/: no /_next/static/ script");

  // Next.js links its icons with a cache-busting query.
  for (const name of ["favicon.ico", "icon.svg", "apple-icon.png"]) {
    const icon = home
      .match(/<link [^>]*>/g)
      ?.filter((tag) => /rel="(?:icon|apple-touch-icon)"/.test(tag))
      .map((tag) => /href="([^"]+)"/.exec(tag)?.[1])
      .find((href) => href?.startsWith(`/${name}?`));
    if (icon) CASES.push(["GET", icon, 200]);
    else failures.push(`/: no <link> to /${name}?…`);
  }

  const indexUrl = /\/api\/search-index\/[a-z0-9]+/.exec(home)?.[0];
  const places = indexUrl
    ? await (await fetch(`${server.origin}${indexUrl}`)).json()
    : [];
  if (places.length === 0) failures.push("/: no search index");
  for (const [i, [id, label]] of places.entries()) {
    const href = `/adres/${encodeURIComponent(id)}`;
    CASES.push(["GET", `/szukaj?q=${encodeURIComponent(label)}`, 308, href]);
    // Every third with a house number, as the field writes it or as typed
    // after a pick.
    if (i % 3 === 0) {
      for (const text of [withHouseNumber(label, "7a"), `${label} 7a`]) {
        CASES.push([
          "GET",
          `/szukaj?q=${encodeURIComponent(text)}`,
          308,
          `${href}?nr=7a`,
        ]);
      }
    }
  }

  const form = /<form[^>]*>[\s\S]*?<\/form>/.exec(home)?.[0] ?? "";
  const tag = /^<form[^>]*>/.exec(form)?.[0] ?? "";
  for (const part of [
    /\smethod="get"/.test(tag),
    /\saction="\/szukaj"/.test(tag),
    form.includes('name="q"'),
    form.includes('<button type="submit" class="govuk-button"'),
  ]) {
    if (!part) failures.push(`/: search form ${JSON.stringify(form)}`);
  }
  // The field without JS: the placeholder input, before the library.
  const field = (html) => /<input[^>]*\sname="q"[^>]*>/.exec(html)?.[0] ?? "";
  const attr = (tag, name) =>
    new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
  const search = (html) =>
    /<search[^>]*>[\s\S]*?<\/search>/.exec(html)?.[0] ?? "";
  for (const [q, parts] of SEARCH) {
    const html = await (
      await fetch(`${server.origin}/szukaj?q=${encodeURIComponent(q)}`)
    ).text();
    const input = field(html);
    const error = q === "";
    const want = {
      value: escapeHtml(q),
      error: error,
      describedBy: error ? "adres-hint adres-error" : "adres-hint",
    };
    const got = {
      value: attr(input, "value"),
      error: /govuk-input--error/.test(attr(input, "class") ?? ""),
      describedBy: attr(input, "aria-describedby"),
    };
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(
        `/szukaj?q=${q}: field ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
      );
    }
    const group = /govuk-form-group--error/.test(search(html));
    const message = html.includes(
      '<p id="adres-error" class="govuk-error-message"><span class="govuk-visually-hidden">Błąd:</span> ',
    );
    // GOV.UK's order: label, hint, error message, field.
    const at = ['id="adres-hint"', 'id="adres-error"', 'name="q"'].map((part) =>
      search(html).indexOf(part),
    );
    if (error && !(at[0] < at[1] && at[1] < at[2])) {
      failures.push(`/szukaj?q=: hint, error, field out of order ${at}`);
    }
    if (group !== error || message !== error) {
      failures.push(
        `/szukaj?q=${q}: error group ${group}, error message ${message}, want ${error}`,
      );
    }
    for (const part of parts) {
      if (!html.includes(part)) failures.push(`/szukaj?q=${q}: no ${part}`);
    }
    // GOV.UK search results: the error summary (if any), the H1, the field,
    // then the results.
    const order = (
      error
        ? ['class="govuk-error-summary"', "<h1", "<search"]
        : ["<h1", "<search", parts[1], parts[2]]
    ).map((part) => html.indexOf(part));
    if (order.some((at, i) => at < 0 || (i > 0 && at < order[i - 1]))) {
      failures.push(`/szukaj?q=${q}: page order ${order}`);
    }
    // Metadata in <head>, never streamed into <body> (htmlLimitedBots).
    const head = html.slice(0, html.indexOf("</head>"));
    if (!head.includes("<title>") || !head.includes('name="robots"')) {
      failures.push(`/szukaj?q=${q}: <title> or robots meta not in <head>`);
    }
  }
  // One field: /szukaj's form is the home page's, but for its value.
  const adama = await (await fetch(`${server.origin}/szukaj?q=adama`)).text();
  const blank = (html) => search(html).replace(/\svalue="[^"]*"/, ' value=""');
  if (!search(home) || blank(adama) !== blank(home)) {
    failures.push(
      `/szukaj?q=adama: search form differs from /\n  / ${search(home)}\n  /szukaj ${search(adama)}`,
    );
  }
  const one = await fetch(`${server.origin}/szukaj?q=Rynek`, {
    redirect: "manual",
  });
  await one.arrayBuffer();
  // A permanent redirect that a browser kept would outlive a data change.
  const store = one.headers.get("cache-control") ?? "";
  if (!/no-store/.test(store)) {
    failures.push(`/szukaj?q=Rynek: Cache-Control ${JSON.stringify(store)}`);
  }

  const street = await (await fetch(`${server.origin}${STREET}`)).text();
  const ics = /href="(\/ics\/[^"?]+)"/.exec(street)?.[1];
  if (ics) CASES.push(["GET", `${ics}?x=1`, 308, ics]);
  else failures.push(`${STREET}: no /ics/ link`);

  for (const [method, path, status, clean] of CASES) {
    const response = await fetch(`${server.origin}${path}`, {
      method,
      redirect: "manual",
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
  const moved = await (
    await fetch(`${server.origin}/api/place-redirects`)
  ).json();
  if (moved["0972447-99999"] !== "0972447-00470") {
    failures.push(`/api/place-redirects: ${JSON.stringify(moved)}`);
  }
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  `Query parameters: ${CASES.length} cases; unknown ones redirect to the clean URL, allowed ones and assets served.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
