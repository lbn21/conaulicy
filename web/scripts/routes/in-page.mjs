// In-page links and Back (task 259), in Chromium on the built site. On the
// first home example's address page: the skip link (a FragmentLink,
// components/fragment-link.tsx) lands on <main>;
// then the logo opens the home page, without the hash, and Back shows the
// address page again, its URL and its content (a plain <a href="#…"> made a
// history entry the App Router did not know, and Back showed the home page
// under the address page's URL). A direct open of
// /adres/<id>#skad-to-wiemy scrolls to „Skąd to wiemy”.
import { HOME_EXAMPLES } from "../../lib/examples.ts";

const VISIBLE_H1 = "main h1:visible";

/**
 * Null if the page is scrolled to `hash`'s element: its top at the
 * viewport's, or the page at its end with the element in view („Skąd to
 * wiemy”, the last section, may not reach the top). Else what is wrong.
 */
async function scrolledTo(page, hash) {
  const { top, atEnd, height } = await page.locator(hash).evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    atEnd:
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 1,
    height: window.innerHeight,
  }));
  return Math.abs(top) <= 1 || (atEnd && top >= 0 && top < height)
    ? null
    : `${hash} is ${Math.round(top)} px from the top`;
}

export async function check(server, failures) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const id = HOME_EXAMPLES[0];
  const address = `${server.origin}/adres/${id}`;
  const page = await (
    await browser.newContext({
      viewport: { width: 375, height: 900 },
      reducedMotion: "reduce",
    })
  ).newPage();
  const landed = [];
  try {
    await page.goto(address, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
    const name = await page.locator(VISIBLE_H1).innerText();

    // The skip link: its target in view, the URL its hash.
    const links = [{ selector: ".govuk-skip-link", hash: "#main-content" }];
    for (const { selector, hash } of links) {
      await page.locator(selector).first().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(`${address}${hash}`);
      const off = await scrolledTo(page, hash);
      if (off) failures.push(`${selector}: ${off}`);
      landed.push(hash);
    }

    // The logo, then Back: the address page again, URL and content.
    const before = page.url();
    await page.locator(".govuk-generic-header__homepage-link").click();
    await page.waitForURL(`${server.origin}/`);
    if (new URL(page.url()).hash) {
      failures.push(`home after the logo: ${page.url()} keeps a hash`);
    }
    await page.goBack();
    await page.waitForURL(before);
    await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
    const back = await page.locator(VISIBLE_H1).allInnerTexts();
    if (back.length !== 1 || back[0] !== name) {
      failures.push(
        `Back to ${before}: visible h1 ${JSON.stringify(back)}, expected "${name}"`,
      );
    }

    // A direct open with a hash: the browser scrolls to it.
    await page.goto(`${address}#skad-to-wiemy`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
    const off = await scrolledTo(page, "#skad-to-wiemy");
    if (off) failures.push(`${address}#skad-to-wiemy opened: ${off}`);
  } finally {
    await browser.close();
  }
  return `In-page links: ${landed.join(", ")} lands, Back after the logo shows the address page, #skad-to-wiemy opens there.`;
}
