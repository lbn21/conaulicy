// The search field, in Chromium on the built site and the CI fixture
// (components/address-search.tsx): a suggestion chosen by a click, a tap or
// ArrowDown and Enter opens its place, one path for all three (the
// library's onConfirm, then „Szukaj”'s own search); Enter with no suggestion
// highlighted still searches for what was typed. The field stays a combobox
// with its list box.
const QUERY = "asn";
const PLACE = "/adres/0972447-00470";

const WAYS = {
  click: (page) => page.locator(".autocomplete__option").first().click(),
  tap: (page) => page.locator(".autocomplete__option").first().tap(),
  "ArrowDown, Enter": async (page) => {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  },
};

async function typed(browser, origin, text, touch = false) {
  const page = await (
    await browser.newContext({
      viewport: { width: 375, height: 800 },
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: "reduce",
    })
  ).newPage();
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  const field = page.locator("#adres");
  await field.click();
  await page.keyboard.type(text);
  return page;
}

export async function check(server, failures) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const [way, choose] of Object.entries(WAYS)) {
      const page = await typed(browser, server.origin, QUERY, way === "tap");
      const field = page.locator("#adres");
      const roles = await field.evaluate((el) => ({
        role: el.getAttribute("role"),
        expanded: el.getAttribute("aria-expanded"),
        owns: el.getAttribute("aria-controls") ?? el.getAttribute("aria-owns"),
      }));
      await page.waitForSelector(".autocomplete__option");
      if (
        roles.role !== "combobox" ||
        !roles.owns ||
        (await page.locator(`#${roles.owns}[role="listbox"]`).count()) !== 1
      )
        failures.push(`${way}: field ${JSON.stringify(roles)}`);
      await choose(page);
      await page
        .waitForURL(`${server.origin}${PLACE}`, { timeout: 10_000 })
        .catch(() => failures.push(`${way}: at ${page.url()}, want ${PLACE}`));
      await page.context().close();
    }
    // Nothing highlighted: Enter searches for the text; a house number in
    // it changes nothing (no page differs by one).
    const page = await typed(browser, server.origin, "asnyka 12");
    await page.waitForSelector(".autocomplete__option");
    await page.keyboard.press("Enter");
    await page
      .waitForURL(`${server.origin}${PLACE}`, { timeout: 10_000 })
      .catch(() => failures.push(`Enter: at ${page.url()}, want ${PLACE}`));
  } finally {
    await browser.close();
  }
  return `Search: a suggestion by ${Object.keys(WAYS).join(", ")} opens its place; Enter with none highlighted searches the text.`;
}
