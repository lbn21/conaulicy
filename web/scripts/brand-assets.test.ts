import assert from "node:assert/strict";
import { test } from "node:test";
import { SHARE } from "../lib/share.ts";
import { SHARE_CARD, SHARE_CARD_TEXT } from "../lib/share-card.ts";
import { ogSvg } from "./brand-assets.ts";

// The share card says what its alt, <title> and aria-label say: all three
// are the card's text (lib/share-card.ts), drawn line by line (one outline
// path each, scripts/brand-assets.ts), never a copy of it.
test("share card: its alt, title and label are the card's lines, one path each", () => {
  const svg = ogSvg();
  const lines = [SHARE_CARD.name, ...SHARE_CARD.tagline, SHARE_CARD.area];
  const images = [SHARE.openGraph?.images, SHARE.twitter?.images].flat();
  for (const image of images)
    assert.equal((image as { alt?: string }).alt, SHARE_CARD_TEXT);
  assert.equal(svg.match(/<title>([^<]*)<\/title>/)?.[1], SHARE_CARD_TEXT);
  assert.equal(svg.match(/aria-label="([^"]*)"/)?.[1], SHARE_CARD_TEXT);
  let from = 0;
  for (const line of lines) {
    const at = SHARE_CARD_TEXT.indexOf(line, from);
    assert.ok(at >= from, line);
    from = at + line.length;
  }
  // The plate, then a path per line after it.
  const after = svg.slice(svg.indexOf('mask="url(#og)"'));
  assert.equal(after.match(/<path fill="[^"]+" d="M/g)?.length, lines.length);
});
