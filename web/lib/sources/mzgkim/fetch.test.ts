import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CUT_99,
  CUT_100,
  DERATYZACJA,
  FEED_2026_10_26,
  feedItem,
  feedWith,
  realMzgkimPost,
  realPage,
  WHOLE_TOWN,
} from "../../mzgkim-fixture.ts";
import { plainText } from "../../zuk.ts";
import { SourceDown } from "../source.ts";
import {
  fetchPosts,
  fullPost,
  MZGKIM_FEED,
  pageText,
  parseFeed,
} from "./fetch.ts";

test("feed: every real item, its id, Warsaw time, link and summary", () => {
  const posts = parseFeed(FEED_2026_10_26);
  assert.equal(posts.length, 10);
  const [cut] = posts;
  assert.equal(cut.id, CUT_100);
  // pubDate "Fri, 02 Oct 2026 10:11:39 +0000": 12:11:39 in Warsaw (CEST).
  assert.equal(cut.date, "2026-10-02T12:11:39");
  assert.equal(cut.modified, cut.date);
  assert.equal(
    cut.link,
    "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/",
  );
  assert.equal(cut.title.rendered, "Przerwa w dostawie wody");
  assert.match(
    plainText(cut.content.rendered),
    /^Miejski Zakład .* w dniu 6 października \(WTOREK\) w godzinach 08\.30 – 15\.00/,
  );
  // Winter time: 13 Nov 2025, 12:38:17 UTC is 13:38:17 in Warsaw.
  const [night] = parseFeed(feedWith([feedItem(WHOLE_TOWN)]));
  assert.equal(night.date, "2025-11-13T13:38:17");
  assert.deepEqual(
    posts.map((p) => p.id),
    [5237, 5234, 5221, 5174, 5150, 5113, 5108, 5079, 5061, 5047],
  );
});

test("feed: the digest tells an edit; an item off MZGKiM's site is left out", () => {
  const item = feedItem(CUT_100);
  const [a] = parseFeed(feedWith([item]));
  const [b] = parseFeed(feedWith([item]));
  assert.equal(a.digest, b.digest);
  assert.match(a.digest ?? "", /^[0-9a-f]{16}$/);
  const [edited] = parseFeed(
    feedWith([item.replace("08.30 &#8211; 15.00", "08.30 &#8211; 16.00")]),
  );
  assert.notEqual(edited.digest, a.digest);
  assert.equal(edited.modified, a.modified);
  const elsewhere = item.replaceAll(
    "https://mzgkim.lubaczow.pl/przerwa",
    "https://example.com/przerwa",
  );
  assert.deepEqual(parseFeed(feedWith([elsewhere])), []);
  assert.throws(() => parseFeed("<html></html>"), SourceDown);
});

const feedFetch =
  (pages: Record<string, Response | (() => Response)>, urls: string[]) =>
  async (url: string | URL) => {
    urls.push(String(url));
    const page = pages[String(url)];
    if (!page) return new Response("not found", { status: 404 });
    return typeof page === "function" ? page() : page.clone();
  };

test("fetch: one feed page holds the window; posts before it left out", async () => {
  const urls: string[] = [];
  const posts = await fetchPosts(
    feedFetch({ [MZGKIM_FEED]: new Response(FEED_2026_10_26) }, urls) as never,
    "2026-09-19",
  );
  assert.deepEqual(
    posts.map((p) => p.id),
    [CUT_100, DERATYZACJA],
  );
  assert.deepEqual(urls, [MZGKIM_FEED]);
});

test("fetch: a window past the page reads the next; 404 ends it", async () => {
  const urls: string[] = [];
  const page2 = `${MZGKIM_FEED}?paged=2`;
  const posts = await fetchPosts(
    feedFetch(
      {
        [MZGKIM_FEED]: new Response(FEED_2026_10_26),
        [page2]: new Response(feedWith([feedItem(WHOLE_TOWN)])),
      },
      urls,
    ) as never,
    "2025-01-01",
  );
  assert.equal(posts.length, 11);
  assert.equal(posts.at(-1)?.id, WHOLE_TOWN);
  assert.deepEqual(urls, [MZGKIM_FEED, page2, `${MZGKIM_FEED}?paged=3`]);
});

test("fetch: the feed down or not a feed is SourceDown", async () => {
  for (const response of [
    new Response("down", { status: 503 }),
    new Response("<html>maintenance</html>"),
  ])
    await assert.rejects(
      fetchPosts(
        feedFetch({ [MZGKIM_FEED]: response }, []) as never,
        "2026-09-19",
      ),
      SourceDown,
    );
  await assert.rejects(
    fetchPosts(
      (async () => {
        throw new Error("ECONNRESET");
      }) as never,
      "2026-09-19",
    ),
    /MZGKiM feed: ECONNRESET/,
  );
});

test("page: the post's own text, its list one line per item", () => {
  const post = realMzgkimPost(CUT_100);
  assert.deepEqual(plainText(post.content.rendered).split("\n"), [
    "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 6 października (WTOREK) w godzinach 08.30 – 15.00 nastąpi przerwa w dostawie wody przy ulicach:",
    "Sobieskiego",
    "Niemirowskiej",
    "Starzyny",
    "Osiedle domów jednorodzinnych na zapleczu",
    "ul. Niemirowskiej",
    "Osiedle Mazury",
    "Przerwa spowodowana jest koniecznością przeprowadzenia prac przyłączeniowych.",
  ]);
  assert.match(
    plainText(realMzgkimPost(CUT_99).content.rendered),
    /\nSobieskiego \(od siedziby Straży Pożarnej w kierunku Dąbrowy\)\n/,
  );
  assert.equal(pageText("<html><body>Nie znaleziono</body></html>"), null);
});

test("fullPost: the page fetched from MZGKiM only; a failure throws", async () => {
  const [post] = parseFeed(feedWith([feedItem(CUT_100)]));
  const urls: string[] = [];
  const page = realPage(post.link) as string;
  const full = await fullPost(
    feedFetch({ [post.link]: new Response(page) }, urls) as never,
    post,
  );
  assert.deepEqual(urls, [post.link]);
  assert.equal(full.digest, post.digest);
  assert.match(full.content.rendered, /<li>Starzyny<\/li>/);
  await assert.rejects(
    fullPost(feedFetch({}, []) as never, post),
    /MZGKiM page: HTTP 404/,
  );
  await assert.rejects(
    fullPost(
      feedFetch({ [post.link]: new Response("<html></html>") }, []) as never,
      post,
    ),
    /no post text/,
  );
  await assert.rejects(
    fullPost(feedFetch({}, []) as never, {
      ...post,
      link: "https://example.com/x",
    }),
    /not on mzgkim\.lubaczow\.pl/,
  );
});
