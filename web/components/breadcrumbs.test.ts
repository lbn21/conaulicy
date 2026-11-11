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
import { Breadcrumbs, type Crumb, HOME_CRUMB } from "./breadcrumbs.tsx";
import { AddressPage, PlaceBreadcrumbs } from "./place-page.tsx";

// GOV.UK's breadcrumbs (components/breadcrumbs.tsx): every item a link, the
// page itself left out, the same markup on every page that has them.
// Structure, never words: the nav's label and the home crumb's are the
// component's own (an aria-label with text; HOME_CRUMB).
const render = (items: readonly Crumb[]) =>
  renderToStaticMarkup(createElement(Breadcrumbs, { items }));
const LABEL = /<nav [^>]*aria-label="([^"]+)"/.exec(render([HOME_CRUMB]))?.[1];
const NAV = `<nav class="govuk-breadcrumbs govuk-breadcrumbs--collapse-on-mobile govuk-!-margin-top-7" aria-label="${LABEL}"><ol class="govuk-breadcrumbs__list">`;
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

// GOV.UK places breadcrumbs before <main>, so the skip link
// (#main-content) skips them. One <main>, the root layout's
// (a page kept hidden by Next.js's Activity would repeat a page's
// own), with the @breadcrumbs slot right before it.

test("the layout: the breadcrumbs slot, then the one <main>", () => {
  assert.match(
    source("app/layout.tsx"),
    /<div className="govuk-width-container">\s*\{breadcrumbs\}\s*<main className="govuk-main-wrapper" id="main-content">\s*\{children\}\s*<\/main>\s*<\/div>/,
  );
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

test("address pages: the column in <main>, no breadcrumbs of their own", () => {
  const html = renderToStaticMarkup(
    AddressPage({ place: testPlace(), children: null }),
  );
  assert.match(html, /^<div class="govuk-grid-row">/);
  assert.doesNotMatch(html, /govuk-breadcrumbs|<main/);
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
