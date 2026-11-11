// Structure only, never the wording (CLAUDE.md, Workflow): every gmina with a
// schedule has a guide, every fraction cites a source we can print, and the
// PDF can draw every tile (an icon, a readable header).
import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, readableInk } from "./contrast.ts";
import { GOVUK_COLOUR, GOVUK_FUNCTIONAL } from "./govuk-colours.ts";
import { FRACTION_ICONS, ICON_ELEMENTS, PDF_ICONS } from "./pdf-icon.ts";
import { GUIDES, guideFor, SHORT_MAX } from "./sorting-guide.ts";
import { FRACTIONS, TOKEN } from "./waste-bin.ts";
import { WASTE_COLOURS } from "./waste-colours.ts";

const tokens = new Set(Object.values(TOKEN));

test("each gmina we have schedules for has a guide", () => {
  for (const gmina of ["Lubaczów (miasto)", "Lubaczów (gmina)"]) {
    assert.ok(GUIDES[gmina], gmina);
  }
});

for (const [gmina, guide] of Object.entries(GUIDES)) {
  test(`${gmina}: every list cites its own gmina's sources`, () => {
    const ids = guide.sources.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate source id");
    for (const source of guide.sources) {
      assert.match(source.url, /^https:\/\//);
      assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(source.label.length > 0);
    }
    for (const entry of [...guide.fractions, guide.pszok]) {
      assert.ok(entry.sources.length > 0, "no source");
      for (const id of entry.sources) assert.ok(ids.includes(id), id);
    }
    // Sources other gminas cite are not this one's.
    for (const [other, theirs] of Object.entries(GUIDES)) {
      if (other === gmina) continue;
      for (const source of theirs.sources) {
        assert.ok(!ids.includes(source.id), `${source.id} shared`);
      }
    }
  });

  test(`${gmina}: one entry per known bin colour, each with what goes in`, () => {
    const seen = guide.fractions.map((f) => f.token);
    assert.equal(new Set(seen).size, seen.length, "duplicate token");
    for (const fraction of guide.fractions) {
      assert.ok(tokens.has(fraction.token), fraction.token);
      const { yes, no } = fraction.short;
      assert.ok(yes.length > 0, `${fraction.token}: no items`);
      // One cap for all: the tiles are the same size.
      assert.ok(
        yes.length <= SHORT_MAX && no.length <= SHORT_MAX,
        fraction.token,
      );
    }
    assert.ok(
      guide.pszok.items.length > 0 && guide.pszok.items.length <= SHORT_MAX,
    );
    assert.ok(guide.pszok.place.length > 0);
    assert.ok(guide.publisher.length > 0);
    assert.ok(guide.sources.some((source) => source.id === guide.fullRules));
  });
}

test("every tile can be drawn: an icon of known shapes, readable ink", () => {
  const inks = [GOVUK_FUNCTIONAL.text, GOVUK_COLOUR.white];
  for (const guide of Object.values(GUIDES)) {
    for (const { token } of guide.fractions) {
      const icon = FRACTION_ICONS[token];
      assert.ok(icon, `${token}: no icon`);
      const fill = WASTE_COLOURS[token];
      assert.ok(fill, `${token}: no colour`);
      assert.ok(contrastRatio(readableInk(fill, inks), fill) >= 4.5, token);
    }
  }
  for (const icon of [
    ...Object.values(FRACTION_ICONS),
    ...Object.values(PDF_ICONS),
  ]) {
    for (const [tag] of icon) assert.ok(ICON_ELEMENTS.has(tag), tag);
  }
});

test("a place gets one tile per covered bin colour, in its own order", () => {
  const order = FRACTIONS.map((f) => f.subtype);
  const guide = guideFor("Lubaczów (miasto)", [
    "zmieszane_i_bio",
    "papier",
    "tworzywa",
    "tworzywa_metale",
  ]);
  assert.ok(guide);
  const subtypes = guide.tiles.map((t) => t.subtype);
  assert.deepEqual(subtypes, ["zmieszane", "bio", "papier", "tworzywa"]);
  assert.deepEqual(
    [...subtypes].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    subtypes,
  );
  // Only the sources its tiles, PSZOK line and full rules cite.
  const cited = new Set([
    guide.fullRules.id,
    ...guide.tiles.flatMap((t) => t.sources),
    ...guide.pszok.sources,
  ]);
  assert.deepEqual(
    guide.sources.map((s) => s.id),
    [...cited].sort(
      (a, b) =>
        guide.sources.findIndex((s) => s.id === a) -
        guide.sources.findIndex((s) => s.id === b),
    ),
  );
});

test("no guide without a gmina's own source, nor without a covered fraction", () => {
  assert.equal(guideFor("Gdzie indziej", ["papier"]), null);
  assert.equal(guideFor("Lubaczów (gmina)", ["opony"]), null);
});
