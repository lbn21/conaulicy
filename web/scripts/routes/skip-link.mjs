// The skip link („Przejdź do treści”, components/skip-link.tsx), in
// Chromium on the built site and the CI fixture, at 390 and 1280 px: on
// the address page and its waste subpage (full loads, and the subpage
// after a client-side navigation from the address page), Enter on the
// link moves focus to the skip target (components/skip-target.tsx): the
// one #main-content in the document, visible, in the page head's band,
// the street line or the h1, after the breadcrumbs' <nav> in DOM order.
// On the home page the target exists, the h1, and takes the focus.
import { SKIP_TARGET_ID } from "../../lib/skip-target.ts";
import { eachPage } from "./each-page.mjs";

const WIDTHS = [390, 1280];
const PLACE = "/adres/0972447-00470";

/** Enter on the skip link, then where the focus is. */
async function skip(page) {
  await page.locator(".govuk-skip-link").focus();
  await page.keyboard.press("Enter");
  await page
    .waitForFunction(
      (id) => document.activeElement?.id === id,
      SKIP_TARGET_ID,
      { timeout: 5000 },
    )
    .catch(() => {});
  return page.evaluate((id) => {
    const focused = document.activeElement;
    const crumbs = [
      ...document.querySelectorAll("main nav.govuk-breadcrumbs"),
    ].find((el) => el.checkVisibility());
    return {
      targets: document.querySelectorAll(`#${id}`).length,
      id: focused?.id ?? null,
      shown: focused?.checkVisibility() === true,
      heading: !!focused?.matches("h1, .govuk-caption-l"),
      inBand: !!focused?.closest("main .app-band"),
      afterCrumbs: crumbs
        ? !!(
            crumbs.compareDocumentPosition(focused) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )
        : null,
    };
  }, SKIP_TARGET_ID);
}

/** What is wrong with where the skip link took the focus. */
function wrong(seen, home) {
  const out = [];
  if (seen.targets !== 1) out.push(`${seen.targets} #${SKIP_TARGET_ID}`);
  if (seen.id !== SKIP_TARGET_ID || !seen.shown || !seen.heading)
    out.push(`the focus on ${JSON.stringify(seen)}, not the shown target`);
  if (!home && (!seen.inBand || seen.afterCrumbs !== true))
    out.push(`the target not in the band after the breadcrumbs`);
  return out;
}

const CASES = {
  "the address page": async (page, origin) => {
    await page.goto(`${origin}${PLACE}`, { waitUntil: "networkidle" });
    return wrong(await skip(page), false);
  },
  "its waste subpage": async (page, origin) => {
    await page.goto(`${origin}${PLACE}/smieci`, { waitUntil: "networkidle" });
    return wrong(await skip(page), false);
  },
  "a subpage after a client-side navigation": async (page, origin) => {
    await page.goto(`${origin}${PLACE}`, { waitUntil: "networkidle" });
    const link = page.locator(`main a[href^="${PLACE}/"]:visible`).first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(`${origin}${href}`);
    return wrong(await skip(page), false);
  },
  "the home page": async (page, origin) => {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    return wrong(await skip(page), true);
  },
};

export async function check(server, failures) {
  const seen = await eachPage(
    failures,
    WIDTHS,
    CASES,
    async (page, run, at) => {
      const out = await run(page, server.origin);
      for (const failure of out) failures.push(`${at}: ${failure}`);
      return out.length === 0;
    },
  );
  return `Skip link: the focus on the heading block, after the breadcrumbs (${seen.join(", ")}).`;
}
