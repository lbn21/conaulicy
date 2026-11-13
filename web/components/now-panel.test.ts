import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NowTileData } from "../lib/now-panel.ts";
import { EXTERNAL, NowTile } from "./now-panel.tsx";
import { NOW_TILES, type NowTileDef } from "./now-tiles.ts";

// One „Teraz w gminie” tile (components/now-panel.tsx NowTile) in its
// states: structure and data only, its words read from what it is given.

const def = NOW_TILES[0];
const tile = (data: NowTileData | null) =>
  renderToStaticMarkup(
    createElement("ul", null, createElement(NowTile, { def, data })),
  );

const populated: NowTileData = {
  value: "V-populated",
  note: "N-populated",
  empty: false,
  featured: true,
  tag: { text: "T-level", level: 2 },
  action: { href: "#szukaj", text: "A-action" },
  checkedAt: null,
};

test("the registry: one entry per tile, unique ids, each with a read", () => {
  assert.ok(NOW_TILES.length >= 4);
  assert.equal(new Set(NOW_TILES.map((d) => d.id)).size, NOW_TILES.length);
  for (const d of NOW_TILES) assert.equal(typeof d.read, "function");
});

test("populated: the module's colour, featured spans, tag in its level, value strong, action", () => {
  const html = tile(populated);
  assert.match(html, new RegExp(`app-mod--${def.icon}`));
  assert.match(html, /app-now__tile--wide/);
  assert.match(
    html,
    /class="govuk-body-s app-now__tag app-warning--2">T-level</,
  );
  assert.match(html, /class="govuk-heading-m">V-populated</);
  assert.match(html, /N-populated/);
  assert.match(
    html,
    /<a class="govuk-link govuk-link--inverse" href="#szukaj">A-action<\/a>/,
  );
  // The source's link, at the foot; the label is no link.
  if (def.source)
    assert.ok(html.includes(`href="${def.source.href}"`), "source link");
  assert.doesNotMatch(html, /app-now__label">(?:(?!<\/p>).)*<a /);
});

test("empty: muted value, no span, no tag, no action", () => {
  const html = tile({
    value: "V-empty",
    note: "N-empty",
    empty: true,
    checkedAt: null,
  });
  assert.match(html, /class="govuk-heading-m app-now__value--empty">V-empty</);
  assert.doesNotMatch(html, /app-now__tile--wide|app-now__tag|#szukaj/);
});

test("not read: muted, no note", () => {
  const html = tile(null);
  assert.match(html, /app-now__value--empty/);
  // The label, and the source's link where the tile has one: no note.
  assert.equal((html.match(/govuk-body-s/g) ?? []).length, def.source ? 2 : 1);
});

test("the skeleton's heading has no id: the live one's is the page's only", () => {
  const source = readFileSync(
    new URL("./now-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /id=\{week \? "teraz" : undefined\}/);
  assert.equal((source.match(/id="teraz"/g) ?? []).length, 0);
});

const withSource = (source: NowTileDef["source"]) =>
  renderToStaticMarkup(
    createElement(
      "ul",
      null,
      createElement(NowTile, { def: { ...def, source }, data: null }),
    ),
  );

test("the registry: every source says whether it is another site", () => {
  for (const d of NOW_TILES) {
    if (!d.source) continue;
    assert.equal(typeof d.source.external, "boolean", d.id);
    assert.ok(d.source.site.trim(), d.id);
    // An http(s) URL is another site: the flag must say so.
    if (/^https?:/.test(d.source.href)) assert.equal(d.source.external, true);
  }
});

test("an external source: its name on screen, „(strona zewnętrzna)” for screen readers", () => {
  const source = {
    href: "https://example.org/",
    text: "S-name",
    external: true,
    site: "S-site",
  };
  const html = withSource(source);
  const link = html.match(
    /<a [^>]*href="https:\/\/example\.org\/"[^>]*>(.*?)<\/a>/,
  );
  assert.ok(link, "a plain <a> to the source");
  // The visible cue names the site; the hidden text says it is another site.
  assert.match(link[1], /S-site/);
  assert.ok(
    link[1].includes(`<span class="govuk-visually-hidden">${EXTERNAL}</span>`),
  );
  // Read or not, the link is there: the tile's last line.
  assert.match(html, /<\/a><\/p><\/li><\/ul>$/);
});

test("a source on the site: no external hint", () => {
  const html = withSource({
    href: "/o-projekcie",
    text: "S-name",
    external: false,
    site: "S-site",
  });
  assert.match(html, /href="\/o-projekcie"/);
  assert.ok(!html.includes(EXTERNAL));
});
