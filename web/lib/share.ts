import type { Metadata } from "next";

// Built by docs/logo/source/ship_a.mjs. A static file, not opengraph-image.png:
// the file convention splits a shared client chunk (+0.3 KB first-load JS).
const SHARE_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "conaulicy.pl: wywozy śmieci przy Twojej ulicy. Lubaczów i gmina.",
};

/** The service's one name: in every title, the header and share tags. */
export const SITE_NAME = "conaulicy.pl";

/** GOV.UK's title: the page's H1, then the service. */
export function pageTitle(h1: string): string {
  return `${h1} – ${SITE_NAME}`;
}

/** The home page's title, and every page's without one of its own. */
export const HOME_TITLE = pageTitle("Sprawdź dzień wywozu śmieci");

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
