import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NowTileData } from "../lib/now-panel.ts";
import { NowTile } from "./now-panel.tsx";
import { NOW_TILES, type NowTileDef } from "./now-tiles.ts";

// One „Teraz w gminie” tile (components/now-panel.tsx NowTile) in its
// states: structure and data only, its words read from what it is given.

const def: NowTileDef = {
  ...NOW_TILES[0],
  action: { href: "#f-field", text: "A-action" },
};
const tile = (
  data: NowTileData | null,
  shown: Pick<NowTileDef, "icon" | "label" | "action"> = def,
) =>
  renderToStaticMarkup(
    createElement("ul", null, createElement(NowTile, { def: shown, data })),
  );

const populated: NowTileData = {
  value: "V-populated",
  note: "N-populated",
  empty: false,
  featured: true,
  tag: { text: "T-level", level: 2 },
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
  // The action, the tile's one link, at its foot; the label is no link.
  assert.match(
    html,
    /<a class="govuk-link govuk-link--inverse" href="#f-field">A-action<\/a><\/p><\/li><\/ul>$/,
  );
  assert.equal((html.match(/<a /g) ?? []).length, 1);
});

test("empty: muted value, no span, no tag", () => {
  const html = tile({
    value: "V-empty",
    note: "N-empty",
    empty: true,
    checkedAt: null,
  });
  assert.match(html, /class="govuk-heading-m app-now__value--empty">V-empty</);
  assert.doesNotMatch(html, /app-now__tile--wide|app-now__tag/);
});

test("not read: muted, no note, the action still there", () => {
  const html = tile(null);
  assert.match(html, /app-now__value--empty/);
  // The label and the action: no note.
  assert.equal((html.match(/govuk-body-s/g) ?? []).length, 2);
  assert.match(html, /href="#f-field"/);
});

test("no tile links off the site: its source is linked in the note only", () => {
  const read: NowTileData = { ...populated, empty: false };
  for (const d of NOW_TILES) {
    const html = tile(read, d);
    for (const [, href] of html.matchAll(/<a [^>]*href="([^"]*)"/g))
      assert.match(href, /^#/, `${d.id}: ${href}`);
  }
});

test("an action is a link to a field on the page, by its id", () => {
  for (const d of NOW_TILES)
    if (d.action) assert.match(d.action.href, /^#[a-z][\w-]*$/, d.id);
});
