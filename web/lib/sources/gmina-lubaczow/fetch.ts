// The gmina's posts, from its WordPress REST API: already in our
// post shape (lib/zuk.ts ZukPost).

import type { ZukPost } from "../../zuk.ts";
import { SourceDown } from "../source.ts";

export const WP_POSTS = "https://www.gminalubaczow.pl/wp-json/wp/v2/posts";
const WP_PAGES = 5;
const WP_TIMEOUT_MS = 15_000;

function isPost(v: unknown): v is ZukPost {
  const p = v as Record<string, unknown>;
  const rendered = (x: unknown) =>
    typeof (x as { rendered?: unknown })?.rendered === "string";
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.id === "number" &&
    typeof p.date === "string" &&
    typeof p.modified === "string" &&
    typeof p.link === "string" &&
    rendered(p.title) &&
    rendered(p.content)
  );
}

/** The posts published since `after` (a Warsaw day). Throws SourceDown. */
export async function fetchPosts(
  fetcher: typeof fetch,
  after: string,
): Promise<ZukPost[]> {
  const posts: ZukPost[] = [];
  for (let page = 1; page <= WP_PAGES; page++) {
    const url = new URL(WP_POSTS);
    url.searchParams.set("after", `${after}T00:00:00`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("_fields", "id,date,modified,link,title,content");
    let body: unknown;
    let pages: number;
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(WP_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.json();
      pages = Number(response.headers.get("x-wp-totalpages") ?? "1");
    } catch (error) {
      throw new SourceDown(`gmina posts: ${(error as Error).message}`);
    }
    if (!Array.isArray(body) || !body.every(isPost))
      throw new SourceDown("gmina posts: not a list of posts");
    posts.push(...body);
    if (!(page < pages)) break;
  }
  return posts;
}
