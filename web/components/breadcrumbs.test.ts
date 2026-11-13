import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccessibilityPage from "../app/dostepnosc/page.tsx";
import NotFound from "../app/not-found.tsx";
import AboutPage from "../app/o-projekcie/page.tsx";
import PrivacyPage from "../app/prywatnosc/page.tsx";
import { SOURCES, source } from "../lib/test-sources.ts";
import { testPlace } from "../lib/water-fixture.ts";
import {
  Breadcrumbs,
  CRUMBS_CLASS,
  type Crumb,
  HOME_CRUMB,
} from "./breadcrumbs.tsx";
import { AddressPage, PlaceBreadcrumbs } from "./place-page.tsx";

// GOV.UK's breadcrumbs (components/breadcrumbs.tsx): every item a link, the
// page itself left out, the same markup on every page that has them.
// Structure, never words: the nav's label and the home crumb's are the
// component's own (an aria-label with text; HOME_CRUMB).
const render = (items: readonly Crumb[]) =>
  renderToStaticMarkup(createElement(Breadcrumbs, { items }));
const LABEL = /<nav [^>]*aria-label="([^"]+)"/.exec(render([HOME_CRUMB]))?.[1];
const NAV = `<nav class="${CRUMBS_CLASS}" aria-label="${LABEL}"><ol class="govuk-breadcrumbs__list">`;
const item = (href: string, text: string) =>
  `<li class="govuk-breadcrumbs__list-item"><a class="govuk-breadcrumbs__link" href="${href}">${text}</a></li>`;
const crumbs = (...items: string[]) => `${NAV}${items.join("")}</ol></nav>`;

test("breadcrumbs: every item a link, in order, nothing else", () => {
  assert.ok(LABEL);
  assert.equal(
    render([HOME_CRUMB, { href: "/ulice#m-0972447", label: "Lubaczów" }]),
    crumbs(item("/", HOME_CRUMB.label), item("/ulice#m-0972447", "Lubaczów")),
  );
  assert.equal(render([HOME_CRUMB]), crumbs(item("/", HOME_CRUMB.label)));
});

test("breadcrumbs: the current page is never an item", () => {
  const html = render([HOME_CRUMB]);
  assert.doesNotMatch(html, /aria-current/);
  assert.equal(html.match(/<li /g)?.length, 1);
  assert.equal(html.match(/<a /g)?.length, 1);
});

// The address pages' crumbs: home, the town or gmina, and on a subpage
// the address itself.
test("address pages: home, the place's list, the address on a subpage", () => {
  const place = (subpage: boolean, over = {}) =>
    renderToStaticMarkup(
      createElement(PlaceBreadcrumbs, { place: testPlace(over), subpage }),
    );
  const home = item("/", HOME_CRUMB.label);
  const town = item("/ulice#m-0972447", "Lubaczów");
  assert.equal(place(false), crumbs(home, town));
  assert.equal(
    place(true, { nr: "12", givenNr: "12" }),
    crumbs(home, town, item("/adres/0972447-26555?nr=12", "ul. Żuki 12")),
  );
  assert.equal(
    place(true, {
      id: "0606010",
      kind: "wieś",
      name: "Dąbrowa",
      area: "gmina Lubaczów",
      group: null,
    }),
    crumbs(
      home,
      item("/ulice#wsie-heading", "Gmina Lubaczów"),
      item("/adres/0606010", "Dąbrowa"),
    ),
  );
});

// One <main>, the root layout's (a page kept hidden by Next.js's Activity
// would repeat a page's own), straight under the header: the address
// pages' breadcrumbs are in their head's band (t400), no slot before it.

test("the layout: the header, then the one <main>", () => {
  const layout = source("app/layout.tsx");
  assert.match(
    layout,
    /<SiteHeader \/>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<main\s+className="govuk-main-wrapper govuk-!-padding-top-0"\s+id="main-content"\s*>\s*\{children\}\s*<\/main>/,
  );
  assert.doesNotMatch(layout, /breadcrumbs\}/);
});

test("no page or component renders a <main> or a main-content id", () => {
  const files = SOURCES.filter(
    (path) =>
      /^(app|components)\/.*\.tsx$/.test(path) && path !== "app/layout.tsx",
  );
  assert.ok(files.length > 20);
  for (const path of files) {
    // JSX, not comments ("before <main>."): <main className=…> or <main>
    // ending its line.
    assert.doesNotMatch(
      source(path),
      /<main(\s+[a-zA-Z]|>\s*$)|id="main-content"/m,
      path,
    );
  }
});

// The address pages' breadcrumbs: the head band's first line, in <main>
// (t400): the band runs unbroken from the header. A subpage's (with a
// caption) end at its address page.
test("address pages: the breadcrumbs the band's first line", () => {
  const band = (caption?: string) =>
    renderToStaticMarkup(
      AddressPage({ place: testPlace(), caption, children: null }),
    );
  const head =
    /^<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds"><div class="app-band">(<nav class="govuk-breadcrumbs[\s\S]*?<\/nav>)/;
  const place = (subpage: boolean) =>
    renderToStaticMarkup(
      createElement(PlaceBreadcrumbs, { place: testPlace(), subpage }),
    );
  assert.equal(head.exec(band())?.[1], place(false));
  assert.equal(head.exec(band("caption"))?.[1], place(true));
  assert.doesNotMatch(band(), /<main/);
});

// The flat pages (and the 404): no breadcrumbs (GOV.UK: none on a site with
// a flat structure). Their elements, not rendered: their async parts (the
// IMGW banner) need the database. /ulice and / read it
// themselves; on every route, scripts/check-warnings.mjs checks in the HTML
// that the crumbs appear only on address pages.
const elements = (node: unknown): ReactElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const { children } = node.props as { children?: unknown };
  return [node, ...elements(children)];
};

test("the flat pages and the 404: no breadcrumbs, no <main> of their own", () => {
  for (const page of [
    AboutPage(),
    PrivacyPage(),
    AccessibilityPage(),
    NotFound(),
  ]) {
    assert.ok(isValidElement(page));
    assert.ok(elements(page).every((el) => el.type !== Breadcrumbs));
    assert.ok(elements(page).every((el) => el.type !== "main"));
  }
});

// Centred between the header and the band's next line: no margin above
// (the band's top padding), below it the band's top padding's token, on
// mobile and from tablet (app/site.scss).
test("the trail: the band's top padding above and below it", () => {
  assert.doesNotMatch(CRUMBS_CLASS, /govuk-!-margin/);
  const scss = source("app/site.scss");
  const pads = [
    ...scss.matchAll(/\.app-band \{[^}]*padding: govuk-spacing\((\d)\)/g),
  ].map((m) => m[1]);
  const below = [
    /\.app-band > \.govuk-breadcrumbs \{ margin: 0 0 govuk-spacing\((\d)\); \}/.exec(
      scss,
    )?.[1],
    /\.app-band > \.govuk-breadcrumbs \{ margin-bottom: govuk-spacing\((\d)\); \}/.exec(
      scss,
    )?.[1],
  ];
  assert.equal(pads.length, 2);
  assert.deepEqual(below, pads);
});
