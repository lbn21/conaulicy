// MZGKiM's komunikaty, from its WordPress RSS feed (its REST API is closed
// to the public): each item in our post shape (lib/zuk.ts ZukPost). The
// feed gives a flattened summary and no edit time, so a post's `digest`
// tells an edit and its page gives the text the model reads (fullPost):
// the post's list items and paragraphs, one per line.

import { createHash } from "node:crypto";
import { isoWithOffset } from "../../dates.ts";
import type { ZukPost } from "../../zuk.ts";
import { SourceDown } from "../source.ts";

export const MZGKIM_FEED =
  "https://mzgkim.lubaczow.pl/category/komunikaty/feed/";
const HOST = "mzgkim.lubaczow.pl";
/** The feed lists 10 posts a page: a few months of MZGKiM's posts. */
const FEED_PAGES = 3;
const TIMEOUT_MS = 15_000;

const tag = (item: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(
    item,
  );
  if (!m) return null;
  const body = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(body);
  return cdata ? cdata[1] : body;
};

/** An RFC 822 date as Warsaw site time, "2026-10-02T12:11:39"; or null. */
function siteTime(rfc: string): string | null {
  const at = Date.parse(rfc);
  return Number.isNaN(at) ? null : isoWithOffset(at).slice(0, 19);
}

/**
 * The feed's posts, newest first. An item without a post id (the guid's
 * ?p=), a date or a link on MZGKiM's own site is left out.
 */
export function parseFeed(xml: string): ZukPost[] {
  if (!/<rss[\s>]/.test(xml) || !/<channel>/.test(xml))
    throw new SourceDown("MZGKiM feed: not an RSS feed");
  const posts: ZukPost[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const id = Number(/[?&]p=(\d+)/.exec(tag(item, "guid") ?? "")?.[1]);
    const date = siteTime(tag(item, "pubDate") ?? "");
    const link = tag(item, "link") ?? "";
    let host = "";
    try {
      host = new URL(link).host;
    } catch {}
    if (!id || !date || host !== HOST) continue;
    const title = tag(item, "title") ?? "";
    const summary = tag(item, "description") ?? "";
    posts.push({
      id,
      date,
      modified: date,
      digest: createHash("sha256")
        .update(`${title}\n${summary}`)
        .digest("hex")
        .slice(0, 16),
      link,
      title: { rendered: title },
      content: { rendered: summary },
    });
  }
  return posts;
}

/** The posts published since `after` (a Warsaw day). Throws SourceDown. */
export async function fetchPosts(
  fetcher: typeof fetch,
  after: string,
): Promise<ZukPost[]> {
  const posts: ZukPost[] = [];
  for (let page = 1; page <= FEED_PAGES; page++) {
    const url = new URL(MZGKIM_FEED);
    if (page > 1) url.searchParams.set("paged", String(page));
    let xml: string;
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      // Past the last page, WordPress answers 404.
      if (page > 1 && response.status === 404) break;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      xml = await response.text();
    } catch (error) {
      throw new SourceDown(`MZGKiM feed: ${(error as Error).message}`);
    }
    const found = parseFeed(xml);
    posts.push(...found.filter((p) => p.date.slice(0, 10) >= after));
    if (found.length === 0 || found.some((p) => p.date.slice(0, 10) < after))
      break;
  }
  return posts;
}

/** The post's text on its page: from the theme's entry-content to its date. */
export function pageText(html: string): string | null {
  const m =
    /<div class="entry-content">([\s\S]*?)<div class="entry-meta[ "]/.exec(
      html,
    );
  return m && m[1].trim() !== "" ? m[1].trim() : null;
}

/** The post with its page's text. Throws on a failed fetch or no text. */
export async function fullPost(
  fetcher: typeof fetch,
  post: ZukPost,
): Promise<ZukPost> {
  if (new URL(post.link).host !== HOST)
    throw new Error(`MZGKiM page: ${post.link} not on ${HOST}`);
  const response = await fetcher(post.link, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MZGKiM page: HTTP ${response.status}`);
  const text = pageText(await response.text());
  if (!text) throw new Error("MZGKiM page: no post text");
  return { ...post, content: { rendered: text } };
}
