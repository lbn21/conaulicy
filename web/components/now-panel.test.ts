import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NowTileData } from "../lib/now-panel.ts";
import { NowTile } from "./now-panel.tsx";
import { NOW_TILES } from "./now-tiles.ts";

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
  // The label links to its source.
  if (def.source)
    assert.ok(html.includes(`href="${def.source.href}"`), "source link");
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
  assert.equal((html.match(/govuk-body-s/g) ?? []).length, 1);
});
