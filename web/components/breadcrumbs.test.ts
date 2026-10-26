import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccessibilityPage from "../app/dostepnosc/page.tsx";
import NotFound from "../app/not-found.tsx";
import AboutPage from "../app/o-projekcie/page.tsx";
import PrivacyPage from "../app/prywatnosc/page.tsx";
import { testPlace } from "../lib/water-fixture.ts";
import { Breadcrumbs, type Crumb, HOME_CRUMB } from "./breadcrumbs.tsx";
import { PlaceBreadcrumbs } from "./place-page.tsx";

// GOV.UK's breadcrumbs (components/breadcrumbs.tsx): every item a link, the
// page itself left out, the same markup on every page that has them.
const NAV =
  '<nav class="govuk-breadcrumbs govuk-!-margin-top-0 govuk-!-margin-bottom-8" aria-label="Ścieżka nawigacyjna"><ol class="govuk-breadcrumbs__list">';
const item = (href: string, text: string) =>
  `<li class="govuk-breadcrumbs__list-item"><a class="govuk-breadcrumbs__link" href="${href}">${text}</a></li>`;
const crumbs = (...items: string[]) => `${NAV}${items.join("")}</ol></nav>`;

const render = (items: readonly Crumb[]) =>
  renderToStaticMarkup(createElement(Breadcrumbs, { items }));

test("breadcrumbs: every item a link, in order, nothing else", () => {
  assert.equal(
    render([HOME_CRUMB, { href: "/ulice#m-0972447", label: "Lubaczów" }]),
    crumbs(item("/", "Strona główna"), item("/ulice#m-0972447", "Lubaczów")),
  );
  assert.equal(render([HOME_CRUMB]), crumbs(item("/", "Strona główna")));
});

test("breadcrumbs: the current page is never an item", () => {
  const html = render([HOME_CRUMB]);
  assert.doesNotMatch(html, /aria-current/);
  assert.equal(html.match(/<li /g)?.length, 1);
  assert.equal(html.match(/<a /g)?.length, 1);
});

// The address pages' crumbs, exactly as before the shared component
// (task 146).
test("address pages: the same crumbs as before", () => {
  const place = (subpage: boolean, over = {}) =>
    renderToStaticMarkup(
      createElement(PlaceBreadcrumbs, { place: testPlace(over), subpage }),
    );
  const home = item("/", "Strona główna");
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

// The pages' own elements, not rendered: their async parts (the IMGW banner)
// need the database. /szukaj, /ulice and / read it themselves; they, and
// every page here, are checked in their HTML by scripts/check-modules.mjs.
const first = (page: unknown) => {
  assert.ok(isValidElement(page));
  const children = (page as ReactElement<{ children: unknown }>).props.children;
  return (Array.isArray(children) ? children : [children])[0];
};

test("the content pages: „Strona główna” first, above everything", () => {
  for (const page of [AboutPage(), PrivacyPage(), AccessibilityPage()]) {
    const crumb = first(page);
    assert.ok(isValidElement(crumb));
    assert.equal(crumb.type, Breadcrumbs);
    assert.deepEqual((crumb.props as { items: Crumb[] }).items, [HOME_CRUMB]);
  }
});

test("the 404 page: no breadcrumbs", () => {
  const page = NotFound();
  assert.ok(isValidElement(page));
  const children = (page.props as { children: unknown[] }).children;
  assert.ok(
    children.every((c) => !isValidElement(c) || c.type !== Breadcrumbs),
  );
});
