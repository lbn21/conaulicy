// Watched pages: the links a source's pages list, hashed every run, so a new
// link nobody picked up is noticed. Also the input of a domain's fallback
// detector when the source's API is down.
import { createHash } from "node:crypto";
import type { Source } from "./config.ts";
import type { Http } from "./http.ts";

/** Absolute links in a page that match a pattern, sorted, without repeats. */
export function pageLinks(
  html: string,
  base: string,
  pattern: string,
): string[] {
  const re = new RegExp(pattern);
  const links = new Set<string>();
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    try {
      const url = new URL(
        raw.replaceAll("&#038;", "&").replaceAll("&amp;", "&"),
        base,
      ).href;
      if (re.test(url)) links.add(url);
    } catch {}
  }
  return [...links].sort();
}

export const linksHash = (links: string[]) =>
  createHash("sha256").update(links.join("\n")).digest("hex");

/** The watched pages' schedule links (also the fallback detector). */
export async function readWatched(source: Source, net: Http) {
  const pages: Array<{ url: string; links: string[]; ignore: string[] }> = [];
  for (const w of source.watch) {
    const html = await (await net.get(w.url)).text();
    pages.push({
      url: w.url,
      links: pageLinks(html, w.url, w.links),
      ignore: w.ignore ?? [],
    });
  }
  return pages;
}
