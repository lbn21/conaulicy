import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURES } from "../lib/config.generated.ts";
import { GMINA_OUTAGE_PAGES, STATIC_PAGES } from "../lib/static-pages.ts";

// The footer's navigation (etl/sources.yaml site.features, components/
// site-footer.tsx): every link a page of the site that works with no
// address, by structure, never its words.

const PAGES = new Set<string>([
  ...STATIC_PAGES.map(({ path }) => path),
  ...GMINA_OUTAGE_PAGES.map(({ path }) => path),
]);

test("every footer feature link is a page of the site that needs no address", () => {
  const links = FEATURES.flatMap((section) => section.links);
  assert.ok(links.length >= 2, "two or more, or the navigation is hidden");
  for (const { href } of links) {
    // Never the home page: the logo links it, and a topic there needs an
    // address first.
    assert.notEqual(href, "/");
    assert.ok(PAGES.has(href), href);
  }
  assert.equal(new Set(links.map((l) => l.href)).size, links.length);
  for (const section of FEATURES) assert.ok(section.links.length > 0);
});
