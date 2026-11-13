// Client-side navigation and the page width (t398), in Chromium on the
// built site and the CI fixture, at 1280 and 1920 px. Next.js keeps a page
// left by a client-side navigation in the document, hidden (React's
// <Activity>), so nothing one page renders may change another's layout:
// the home page's full-width hero once held the layout's width container
// open with a `:has()` that still matched the hidden hero after the
// navigation, and the address page lay flush left, the full window wide.
// Each path below starts with a full load of its first page, then only
// client-side navigations:
//   home, a suggestion clicked (the address page), Back (home), Forward;
//   home, „Szukaj” (the address page);
//   home, the link to /ulice; home, the footer's link to /o-projekcie;
//   the address page, the logo (home).
// On every page reached: each visible width container centred, at most
// GOV.UK's 960 px wide; no visible hero but on the home page; there, the
// hero the window's full width and its own container centred.
import { HOME_EXAMPLES } from "../../lib/examples.ts";
import { ABOUT } from "../../lib/static-pages.ts";
import { eachPage } from "./each-page.mjs";

const WIDTHS = [1280, 1920];
const QUERY = "asn";
const PLACE = "/adres/0972447-00470";
const MAX_WIDTH = 960;
const TOLERANCE = 1;

/** What is wrong with the page's layout now, as a list. */
async function layout(page, home) {
  await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
  const seen = await page.evaluate(() => {
    const shown = (el) => el.getClientRects().length > 0;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width };
    };
    return {
      window: document.documentElement.clientWidth,
      containers: [...document.querySelectorAll(".govuk-width-container")]
        .filter(shown)
        .map((el) => ({ ...box(el), name: el.className })),
      heroes: [...document.querySelectorAll(".app-hero")]
        .filter(shown)
        .map(box),
      h1: [...document.querySelectorAll("main h1")].filter(shown).length,
    };
  });
  const wrong = [];
  for (const { left, width, name } of seen.containers) {
    const off = Math.abs(left - (seen.window - width) / 2);
    if (width > MAX_WIDTH + TOLERANCE || off > TOLERANCE)
      wrong.push(
        `"${name}" at x ${left.toFixed(1)}, ${width.toFixed(1)} px wide (centred, ≤ ${MAX_WIDTH} expected)`,
      );
  }
  if (seen.h1 !== 1) wrong.push(`${seen.h1} visible h1`);
  if (home) {
    const [hero] = seen.heroes;
    if (seen.heroes.length !== 1) wrong.push(`${seen.heroes.length} heroes`);
    else if (hero.left !== 0 || Math.abs(hero.width - seen.window) > TOLERANCE)
      wrong.push(
        `the hero at x ${hero.left}, ${hero.width} px wide (the window's ${seen.window})`,
      );
  } else if (seen.heroes.length > 0) {
    wrong.push(`${seen.heroes.length} visible hero(es) off the home page`);
  }
  return wrong;
}

async function search(page) {
  await page.locator("#adres").click();
  await page.keyboard.type(QUERY);
  await page.waitForSelector(".autocomplete__option");
}

const PATHS = {
  "suggestion, Back, Forward": async (page, origin, at) => {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await search(page);
    await page.locator(".autocomplete__option").first().click();
    await page.waitForURL(`${origin}${PLACE}`);
    await at(PLACE, false);
    await page.goBack();
    await page.waitForURL(`${origin}/`);
    await at("Back to /", true);
    await page.goForward();
    await page.waitForURL(`${origin}${PLACE}`);
    await at(`Forward to ${PLACE}`, false);
  },
  "„Szukaj”": async (page, origin, at) => {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await search(page);
    await page.locator(".app-hero__search .govuk-button").click();
    await page.waitForURL(`${origin}${PLACE}`);
    await at(PLACE, false);
  },
  "/ulice": async (page, origin, at) => {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.locator('main a[href="/ulice"]').first().click();
    await page.waitForURL(`${origin}/ulice`);
    await at("/ulice", false);
  },
  [ABOUT.path]: async (page, origin, at) => {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.locator(`.govuk-footer a[href="${ABOUT.path}"]`).click();
    await page.waitForURL(`${origin}${ABOUT.path}`);
    await at(ABOUT.path, false);
  },
  "the logo": async (page, origin, at) => {
    const address = `/adres/${HOME_EXAMPLES[0]}`;
    await page.goto(`${origin}${address}`, { waitUntil: "networkidle" });
    await at(address, false);
    await page.locator(".govuk-generic-header__homepage-link").click();
    await page.waitForURL(`${origin}/`);
    await at("/ after the logo", true);
  },
};

export async function check(server, failures) {
  const seen = await eachPage(
    failures,
    WIDTHS,
    PATHS,
    async (page, walk, at) => {
      const count = failures.length;
      await walk(page, server.origin, async (where, home) => {
        for (const wrong of await layout(page, home))
          failures.push(`${at}, ${where}: ${wrong}`);
      });
      return failures.length === count;
    },
  );
  return `Client-side navigation: the width containers centred and ≤ ${MAX_WIDTH} px, the hero on the home page only (${seen.join(", ")}).`;
}
