// The share card's words (public/og.png, drawn by scripts/brand-assets.ts
// into lib/brand/og.svg): one source for what it shows and for its alt, its
// <title> and its aria-label (lib/share.ts SHARE_IMAGE), so they never
// disagree. Plain Node scripts import this file too: no imports.

/** The service's one name: in every title, the header and share tags. */
export const SITE_NAME = "conaulicy.pl";

/** Where the site is for: the home page's title and the card's last line. */
export const SITE_AREA = "Lubaczów i gmina";

/**
 * The card, line by line as drawn: the name (bold), the tagline (each
 * entry one line, wrapped by hand within the block, never shrunk) and the
 * area (secondary text).
 */
export const SHARE_CARD = {
  name: SITE_NAME,
  tagline: ["Sprawdź swoją ulicę", "śmieci, woda, prąd", "i ostrzeżenia IMGW"],
  area: SITE_AREA,
} as const;

/**
 * The card's text as one sentence for its alt, <title> and aria-label:
 * every line's words in order, the tagline's wraps joined by spaces.
 */
export const SHARE_CARD_TEXT = `${SHARE_CARD.name}: ${SHARE_CARD.tagline[0]} – ${SHARE_CARD.tagline.slice(1).join(" ")}. ${SHARE_CARD.area}`;
