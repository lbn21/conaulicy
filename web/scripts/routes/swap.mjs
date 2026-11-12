// The skeleton-to-page swap (components/place-suspense.tsx): on each
// subpage of the CI fixture's town street, at 390 and 1280 px, the page
// head's band (.app-band) of the skeleton and of the page start and end at
// the same y, within 1 px, so nothing under it moves at the reveal. The
// skeleton is the page with JavaScript off: the streamed content then stays
// in React's hidden <div>, the skeleton on screen. /woda's water cut
// (MZGKIM_MOCK, .github/workflows/ci.yml) gives it its actions, checked
// to be there, so the page measured is the one with them.

const WIDTHS = [390, 1280];
const TOLERANCE = 1;
const PLACE = "/adres/0972447-00470";
const SUBPAGES = ["smieci", "woda", "prad"];
// Pages whose actions („Zapisz terminy”, components/subpage-parts.tsx)
// the fixture must show.
const ACTIONS = ["smieci", "woda"];

/** The band's top and bottom, with JavaScript on (the page) or off. */
async function band(browser, url, width, javaScriptEnabled) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    javaScriptEnabled,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    if (javaScriptEnabled)
      await page.waitForFunction(
        () => !document.querySelector(".app-skeleton"),
      );
    return await page.evaluate(async () => {
      await document.fonts.ready;
      const r = document
        .querySelector("main .app-band")
        ?.getBoundingClientRect();
      return {
        box: r && [r.top, r.bottom],
        actions: !!document.querySelector('[aria-labelledby="zapisz"]'),
      };
    });
  } finally {
    await context.close();
  }
}

export async function check(server, failures) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const seen = [];
  try {
    for (const slug of SUBPAGES) {
      const url = `${server.origin}${PLACE}/${slug}`;
      for (const width of WIDTHS) {
        const skeleton = await band(browser, url, width, false);
        const page = await band(browser, url, width, true);
        const at = `${PLACE}/${slug} at ${width}`;
        if (!skeleton.box || !page.box) {
          failures.push(`${at}: no .app-band in the skeleton or the page`);
          continue;
        }
        const shift = Math.max(
          ...[0, 1].map((i) => Math.abs(page.box[i] - skeleton.box[i])),
        );
        if (shift > TOLERANCE)
          failures.push(
            `${at}: the band moves ${shift.toFixed(2)} px at the reveal (skeleton ${skeleton.box.map((y) => y.toFixed(1)).join("–")}, page ${page.box.map((y) => y.toFixed(1)).join("–")})`,
          );
        if (ACTIONS.includes(slug) && !page.actions)
          failures.push(`${at}: no actions („Zapisz terminy”) on the page`);
        seen.push(`${slug}@${width} ${shift.toFixed(2)} px`);
      }
    }
  } finally {
    await browser.close();
  }
  return `Skeleton swap: ${seen.join(", ")}.`;
}
