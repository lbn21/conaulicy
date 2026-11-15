import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FEATURES } from "../lib/config.generated.ts";
import {
  type GminaPower,
  gminaPower,
  gminaPowerPage,
  gminaWater,
  gminaWaterPage,
} from "../lib/gmina-outages.ts";
import { MODULES } from "../lib/modules.ts";
import type { OutagePage } from "../lib/outage-view.ts";
import { ours, parseOutages } from "../lib/pge-feed.ts";
import { derivedOurs } from "../lib/pge-fixture.ts";
import { pageMetadata } from "../lib/share.ts";
import {
  GMINA_OUTAGE_PAGES,
  type GminaOutageSlug,
} from "../lib/static-pages.ts";
import {
  bothViews,
  CHECKED,
  NOW,
  POST_39885,
  storedPost,
} from "../lib/water-fixture.ts";
import { ZUK_PLACES } from "../lib/zuk-places.generated.ts";
import { GminaPage, gminaMetadata } from "./gmina-outages.tsx";

// The gmina-wide outage pages (components/gmina-outages.tsx) as they
// reach the browser, by structure, never their words: the site's one frame
// (the band: the module's h1 and tile, a lead, the way home), then the
// outages' one body (components/outage-page.tsx) in the module's colours,
// its links only to the site's own address pages; their metadata; and the
// HTML size of a big storm.

const PGE_NOW = Date.parse("2026-11-11T16:52:00Z");
const FEED = {
  fetchedAt: new Date(PGE_NOW).toISOString(),
  items: ours(
    parseOutages(derivedOurs(), () => {}),
    ZUK_PLACES,
    () => {},
  ),
};
const EVERY = [
  ...ZUK_PLACES.localities.map((l) => l.id),
  ...ZUK_PLACES.streets.map((s) => s.id),
];

const render = (slug: GminaOutageSlug, page: OutagePage) =>
  renderToStaticMarkup(
    createElement(GminaPage, { slug, today: "2026-10-25", page }),
  ).replace(/<svg\b.*?<\/svg>/g, "<svg/>");

const PAGES: Record<string, () => [GminaOutageSlug, OutagePage]> = {
  "/woda": () => [
    "woda",
    gminaWaterPage(
      gminaWater(bothViews([storedPost(POST_39885, CHECKED)], CHECKED, NOW)),
      EVERY,
    ),
  ],
  "/woda, none": () => [
    "woda",
    gminaWaterPage(gminaWater(bothViews([], CHECKED, NOW)), EVERY),
  ],
  "/prad": () => [
    "prad",
    gminaPowerPage(
      gminaPower(
        { feed: FEED, failingSince: null, changedAt: PGE_NOW },
        PGE_NOW,
      ),
      EVERY,
    ),
  ],
  "/prad, none": () => [
    "prad",
    gminaPowerPage(
      gminaPower(
        {
          feed: { ...FEED, items: [] },
          failingSince: null,
          changedAt: PGE_NOW,
        },
        PGE_NOW,
      ),
      EVERY,
    ),
  ],
};

const at = (html: string, marker: string) => html.indexOf(marker);
const ascending = (positions: number[]) =>
  positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]));

for (const [name, make] of Object.entries(PAGES)) {
  const [slug, page] = make();
  const html = render(slug, page);

  test(`${name}: one h1, the module's tile in it, the band's order`, () => {
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(
      html,
      new RegExp(
        `<h1 [^>]*class="govuk-heading-l"[^>]*><span class="app-tile app-mod app-mod--${slug}">`,
      ),
    );
    // The band: the h1, the lead, the way to one's own address (home).
    assert.ok(
      ascending([
        at(html, 'class="app-band"'),
        at(html, "<h1"),
        at(html, 'class="govuk-body-l"'),
        at(html, 'href="/"'),
        at(html, `class="app-mod app-mod--${slug}"`),
      ]),
    );
    // Flat: no breadcrumbs, no caption, no search, no „Zmień adres”.
    assert.doesNotMatch(html, /govuk-breadcrumbs|govuk-caption|<input\b/);
    assert.doesNotMatch(html, /govuk-link--no-visited-state/);
  });

  test(`${name}: the outages' one body, its source last`, () => {
    const body = html.slice(at(html, `app-mod--${slug}"><`));
    const first = page.empty
      ? at(body, '<p class="app-empty govuk-body">')
      : at(body, '<section aria-labelledby="dzien-');
    assert.ok(
      ascending([
        first,
        at(body, 'class="govuk-inset-text"'),
        at(body, '<p class="govuk-body-s app-quiet">'),
      ]),
    );
    if (page.empty) {
      // Plain grey text: no badge, card or bold.
      assert.doesNotMatch(body, /app-badge|app-card|<strong/);
      assert.doesNotMatch(body, /govuk-warning-text/);
    } else {
      assert.ok(at(body, 'class="app-card"') > 0);
    }
    // No calendar: there is no gmina-wide file.
    assert.doesNotMatch(body, /aria-labelledby="zapisz"/);
  });

  test(`${name}: every own link is an address subpage, by next/link`, () => {
    const own = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    for (const href of own.filter((h) => h !== "/"))
      assert.match(href, new RegExp(`^/adres/[^/]+/${slug}$`));
    if (!page.empty) assert.ok(own.length > 1);
  });
}

test("metadata: its own canonical, OG and Twitter, the module's h1 in the title", () => {
  for (const { slug, path } of GMINA_OUTAGE_PAGES) {
    const meta = gminaMetadata(slug);
    const { pageTitle } = MODULES[slug];
    assert.equal(meta.alternates?.canonical, path);
    const og = meta.openGraph as Record<string, unknown>;
    assert.equal(og.url, path);
    assert.equal(og.type, "website");
    assert.ok(String(og.title).startsWith(`${pageTitle} – `));
    assert.equal(og.description, meta.description);
    assert.ok(Array.isArray(og.images) && og.images.length === 1);
    const twitter = meta.twitter as Record<string, unknown>;
    assert.equal(twitter.card, "summary_large_image");
    assert.equal(twitter.title, og.title);
    // The shared base, as every page (lib/share.ts).
    const base = pageMetadata({ path, title: "x", description: "y" });
    assert.deepEqual(og.images, (base.openGraph as typeof og).images);
    assert.ok(String(meta.description).includes(pageTitle));
    // Indexed in production by the layout: no robots of its own.
    assert.equal(meta.robots, undefined);
  }
});

test("a big storm: the page's body well within the street HTML budget", () => {
  // 60 outages over 3 days, each over 8 streets with PGE's long lists of
  // house numbers: beyond any real storm (≈ tens at peak).
  const streets = ZUK_PLACES.streets.slice(0, 8);
  const numbers = Array.from({ length: 60 }, (_, i) => `${i + 1}`).join(", ");
  const items = Array.from({ length: 60 }, (_, i) => {
    const day = `2026-11-${12 + (i % 3)}`;
    return {
      uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      kind: i % 4 === 0 ? ("failure" as const) : ("planned" as const),
      revoked: i % 10 === 0,
      revokedNote: null,
      ranges: [
        {
          start: `${day}T08:00:00+01:00`,
          end: `${day}T14:00:00+01:00`,
        },
      ],
      addresses: streets.map((s) => ({
        simc: s.localityId,
        ulic: s.id.split("-")[1],
        numbers,
      })),
      updatedAt: FEED.fetchedAt,
    };
  });
  const data = gminaPower(
    { feed: { ...FEED, items }, failingSince: null, changedAt: PGE_NOW },
    PGE_NOW,
  ) as GminaPower;
  assert.equal(data.cuts.length, items.length);
  const html = render("prad", gminaPowerPage(data, EVERY));
  // The street HTML budget (CLAUDE.md, 30 KB gzip) holds the page twice
  // (its HTML and the RSC payload) and the site's chrome: the body takes
  // at most a third.
  const size = gzipSync(html).length;
  assert.ok(size <= 10_000, `${size} B gzip`);
  // And parsed in reasonable time on a slow phone.
  assert.ok(html.length <= 400_000, `${html.length} B`);
});

test("the footer links both pages, each by its h1 (etl/sources.yaml)", () => {
  const links = FEATURES.flatMap((section) => section.links);
  for (const { slug, path } of GMINA_OUTAGE_PAGES)
    assert.deepEqual(
      links.filter((link) => link.href === path).map((link) => link.text),
      [MODULES[slug].pageTitle],
    );
});
