// „Teraz w gminie”'s action (NOW_TILES, components/field-link.tsx), in
// Chromium on the built site, at 1280 and 390 px: a click on it, and Enter
// on it, put the caret in the home page's search field, its label in view.
// No tile links off the site (t398): its links all lead to the page itself.
import { SEARCH_INPUT_ID } from "../../lib/search.ts";
import { eachPage } from "./each-page.mjs";

const WIDTHS = [1280, 390];
const ACTION = `.app-now__tile a[href="#${SEARCH_INPUT_ID}"]`;

const WAYS = {
  click: (link) => link.click(),
  Enter: async (link) => {
    await link.focus();
    await link.press("Enter");
  },
};

export async function check(server, failures) {
  const seen = await eachPage(failures, WIDTHS, WAYS, async (page, use, at) => {
    await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
    const off = await page
      .locator(".app-now__tile a")
      .evaluateAll((links) =>
        links
          .map((a) => a.getAttribute("href"))
          .filter((h) => !h?.startsWith("#")),
      );
    if (off.length > 0)
      failures.push(`${at}: tile links off the page: ${off.join(", ")}`);
    await use(page.locator(ACTION));
    const state = await page
      .waitForFunction(
        (id) => document.activeElement?.id === id,
        SEARCH_INPUT_ID,
        { timeout: 5_000 },
      )
      .then(() =>
        page.evaluate((id) => {
          const label = document
            .querySelector(`label[for="${id}"]`)
            ?.getBoundingClientRect();
          // In view within 1 px: scrollIntoView() puts its top at the
          // viewport's, on a fractional y.
          return {
            label: label && [label.top, label.bottom].map((y) => y.toFixed(2)),
            labelInView:
              !!label && label.top >= -1 && label.bottom <= innerHeight + 1,
          };
        }, SEARCH_INPUT_ID),
      )
      .catch(async () => ({
        active: await page.evaluate(
          () => document.activeElement?.outerHTML.slice(0, 80) ?? null,
        ),
      }));
    if ("active" in state)
      failures.push(`${at}: focus on ${state.active}, not #${SEARCH_INPUT_ID}`);
    else if (!state.labelInView)
      failures.push(
        `${at}: the field's label out of view (y ${state.label?.join("–")})`,
      );
    else return off.length === 0;
  });
  return `„Teraz w gminie”'s action focuses the search field (${seen.join(", ")}); no tile links off the site.`;
}
