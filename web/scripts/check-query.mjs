// Unknown query parameters redirect (308) to the clean URL, so random query
// strings cannot bust the CDN cache (proxy.ts, lib/clean-query.ts). Allowed
// ones (nr on street pages and PDFs, q on /api/search and /szukaj) are
// served as they are; Next.js assets, icons with their cache-busting query,
// other files and POST /api/revalidate are never redirected. The Apple icon
// is linked at the root with no query, and served as a PNG.
//
// Also the search without JS: the home page's raw HTML is a GET form to
// /szukaj with a field named q and a submit button, and /szukaj answers it:
// one place redirects (never stored; a bot gets a 308, a browser the same
// redirect client-side, with JS) to its page with the house number,
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
import {
  BOT_UA,
  BROWSER_UA,
  finish,
  searchIndexOf,
  startServer,
} from "./lib/server.mjs";

const escapeHtml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STREET = "/adres/0972447-00470";
const SPLIT = "/adres/0972447-90004";
const RENAMED = "/adres/0972447-99999";

// [method, path, status, clean path + query for a redirect, user agent]. A
// one-place search is asked as an HTML-limited bot: its render is not
// streamed, so the redirect is a real 308. A browser gets /szukaj's
// prerendered shell, so the same redirect is a client-side one
// (nextjs.org/docs/app/api-reference/functions/redirect): check-search
// asserts where it lands.
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
  ["GET", "/szukaj?q=Rynek", 308, "/adres/0972447-19253", BOT_UA],
  ["GET", "/szukaj?q=asnyka%2012", 308, "/adres/0972447-00470?nr=12", BOT_UA],
  [
    "GET",
    `/szukaj?q=${encodeURIComponent("ul. Rynek, Lubaczów")}`,
    308,
    "/adres/0972447-19253",
    BOT_UA,
  ],
  // A house number where the field puts it, or typed after a pick.
  ...[
    ["ul. Rynek 5, Lubaczów", "/adres/0972447-19253?nr=5"],
    ["ul. Rynek, Lubaczów 5", "/adres/0972447-19253?nr=5"],
    ["ul. Adama Asnyka 12, Lubaczów", "/adres/0972447-00470?nr=12"],
    ["ul. Adama Asnyka, Lubaczów 12", "/adres/0972447-00470?nr=12"],
  ].map(([q, to]) => [
    "GET",
    `/szukaj?q=${encodeURIComponent(q)}`,
    308,
    to,
    BOT_UA,
  ]),
  ["GET", "/szukaj?q=adama", 200],
  // Under 3 letters, a list, never one place (lib/search.ts CLEAR_MIN).
  ["GET", "/szukaj?q=a", 200],
  ["GET", "/szukaj?q=as", 200],
  ["GET", "/szukaj?q=asn", 308, "/adres/0972447-00470", BOT_UA],
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
    const page = (ua) =>
      fetch(`${server.origin}/szukaj?q=${encodeURIComponent(q)}`, {
        headers: { "user-agent": ua },
      }).then((res) => res.text());
    const html = await page(BROWSER_UA);
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
    // The metadata: in <head> for an HTML-limited bot; a browser may get
    // it streamed, so anywhere in its document (next.config.ts).
    const bot = await page(BOT_UA);
    const head = bot.slice(0, bot.indexOf("</head>"));
    if (!head.includes("<title>") || !head.includes('name="robots"')) {
      failures.push(
        `/szukaj?q=${q} (bot): <title> or robots meta not in <head>`,
      );
    }
    if (!html.includes("<title>") || !html.includes('name="robots"')) {
      failures.push(`/szukaj?q=${q} (browser): no <title> or robots meta`);
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
  // Never stored, for a bot (its 308: a permanent redirect a client kept
  // would outlive a data change) and a browser (200, the redirect inside).
  for (const [ua, status] of [
    [BOT_UA, 308],
    [BROWSER_UA, 200],
  ]) {
    const one = await fetch(`${server.origin}/szukaj?q=Rynek`, {
      headers: { "user-agent": ua },
      redirect: "manual",
    });
    await one.arrayBuffer();
    const store = one.headers.get("cache-control") ?? "";
    if (one.status !== status || !/no-store/.test(store)) {
      failures.push(
        `/szukaj?q=Rynek (${ua === BOT_UA ? "bot" : "browser"}): ${one.status}, Cache-Control ${JSON.stringify(store)}`,
      );
    }
  }

  // The calendar link is on the waste subpage (the address page has none).
  const street = await (await fetch(`${server.origin}${STREET}/smieci`)).text();
  const ics = /href="(\/ics\/[^"?]+)"/.exec(street)?.[1];
  if (ics) CASES.push(["GET", `${ics}?x=1`, 308, ics]);
  else failures.push(`${STREET}/smieci: no /ics/ link`);

  for (const [method, path, status, clean, ua] of CASES) {
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
  const moved = await (
    await fetch(`${server.origin}/api/place-redirects`)
  ).json();
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
