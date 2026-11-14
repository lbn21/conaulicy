import type { Metadata } from "next";
import { SHARE_CARD_TEXT, SITE_AREA, SITE_NAME } from "./share-card.ts";

export { SITE_NAME };

// Drawn by scripts/brand-assets.ts (from lib/brand/og.svg). A static file,
// not opengraph-image.png: the file convention splits a shared client chunk
// (+0.3 KB first-load JS).
const SHARE_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  // Exactly what the card shows: its lines (lib/share-card.ts), also its
  // <title> and aria-label.
  alt: SHARE_CARD_TEXT,
};

/** GOV.UK's title: the page's H1, then the service. */
function pageTitle(h1: string): string {
  return `${h1} – ${SITE_NAME}`;
}

/** The home page's H1. */
const HOME_H1 = "Co na Twojej ulicy?";

/**
 * The locality after the home page's H1 in its title only (never the h1), as
 * a place's pages add theirs: local searches name the town (t396).
 */
const HOME_LOCALITY = SITE_AREA;

/** The home page's title: its H1 and locality, then the service. */
export const HOME_TITLE = pageTitle(`${HOME_H1} ${HOME_LOCALITY}`);

/** The layout's share metadata: every page's image, name and language. */
export const SHARE = {
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "pl_PL",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
} satisfies Metadata;

/**
 * A page's own description, in search results and when shared. Next replaces
 * a parent's openGraph and twitter instead of merging them, so each page
 * repeats the layout's base. The page's title goes through the layout's
 * template ({ absolute } skips it); the share title is the same full title.
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  /** The canonical path, e.g. "/adres/0972447-19253". */
  path: string;
  title: string | { absolute: string };
  description: string;
}): Metadata {
  const full = typeof title === "string" ? pageTitle(title) : title.absolute;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...SHARE.openGraph, url: path, title: full, description },
    twitter: { ...SHARE.twitter, title: full, description },
  };
}
