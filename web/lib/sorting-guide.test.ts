// Structure only, never the wording (CLAUDE.md, Workflow): every gmina with a
// schedule has a guide, every fraction cites a source we can print, and the
// PDF can draw every tile (an icon, a readable header).
import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, readableInk } from "./contrast.ts";
import { GOVUK_COLOUR, GOVUK_FUNCTIONAL } from "./govuk-colours.ts";
import { FRACTION_ICONS, ICON_ELEMENTS, PDF_ICONS } from "./pdf-icon.ts";
import {
  BIN_TOKENS,
  GUIDES,
  guideFor,
  SEPARATE_TOKENS,
  SHORT_MAX,
} from "./sorting-guide.ts";
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

test("a bin's fraction has no „where”, separate waste always has one", () => {
  for (const guide of Object.values(GUIDES)) {
    for (const fraction of guide.fractions) {
      const bin = (BIN_TOKENS as readonly string[]).includes(fraction.token);
      const separate = (SEPARATE_TOKENS as readonly string[]).includes(
        fraction.token,
      );
      assert.ok(bin !== separate, `${fraction.token}: bin or separate`);
      if (bin) assert.equal(fraction.where, null, fraction.token);
      else assert.ok(fraction.where?.length, fraction.token);
    }
  }
});

test("a gmina's page: every entry, in the page's order, named by a known fraction", () => {
  const subtypes = new Set(FRACTIONS.map((f) => f.subtype));
  for (const [gmina, source] of Object.entries(GUIDES)) {
    const guide = guideFor(gmina);
    assert.ok(guide);
    const tokens = [...guide.bins, ...guide.separate].map((t) => t.token);
    assert.deepEqual(
      tokens,
      [...BIN_TOKENS, ...SEPARATE_TOKENS].filter((token) =>
        source.fractions.some((f) => f.token === token),
      ),
    );
    for (const item of [...guide.bins, ...guide.separate]) {
      assert.ok(subtypes.has(item.subtype), item.subtype);
      assert.equal(TOKEN[item.subtype], item.token);
    }
    // Only the sources its entries, PSZOK line and full rules cite.
    const cited = new Set([
      guide.fullRules.id,
      ...[...guide.bins, ...guide.separate].flatMap((t) => t.sources),
      ...guide.pszok.sources,
    ]);
    assert.deepEqual(
      guide.sources.map((s) => s.id),
      source.sources.map((s) => s.id).filter((id) => cited.has(id)),
    );
  }
});

test("no guide without a gmina's own source", () => {
  assert.equal(guideFor("Gdzie indziej"), null);
});
