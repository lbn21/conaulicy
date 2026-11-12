// What a lint cannot see (t366 section 6): something placed by a font's
// numbers holds at 100 % and drifts when the text grows. At 200 % text
// size (the root's font size doubled, as a browser's text-only zoom;
// GOV.UK's type is in rem), at 390 and 1280 px, on the CI fixture's town
// street: the h1's icon tile's centre within 1 px of the h1's first
// line's cap centre (t366's C1, t369). The timeline's dots join this
// check with t368 (C8): whichever of the two lands second takes t368's
// file with TILE_EXPECTED_TO_FAIL false.
// The cap centre: the first character's baseline (its text box's top plus
// the font's ascent, from canvas metrics) less half the cap height of „H”.

const WIDTHS = [390, 1280];
const TOLERANCE = 1;
const PLACE = "/adres/0972447-00470";

async function open(browser, url, width) {
  const page = await (
    await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    })
  ).newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector(".app-skeleton"));
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.fontSize = "200%";
  });
  return page;
}

/** The h1's tile's centre less its first line's cap centre, in px. */
const tile = (page) =>
  page.$eval("h1", (h1) => {
    const icon = h1.querySelector(".app-tile");
    const text = [...h1.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    const range = document.createRange();
    const at = text.textContent.search(/\S/);
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const box = range.getClientRects()[0];
    const style = getComputedStyle(h1);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const m = ctx.measureText("H");
    const cap =
      box.top + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent / 2;
    const r = icon.getBoundingClientRect();
    return r.top + r.height / 2 - cap;
  });

export async function check(server, failures) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const seen = [];
  try {
    for (const width of WIDTHS) {
      const sub = await open(browser, `${server.origin}${PLACE}/smieci`, width);
      const d = await tile(sub);
      if (Math.abs(d) > TOLERANCE)
        failures.push(
          `${PLACE}/smieci at ${width}, 200 %: the h1's tile is ${d.toFixed(2)} px off its cap centre`,
        );
      seen.push(`${width}: h1 tile ${d.toFixed(2)} px`);
    }
  } finally {
    await browser.close();
  }
  return `200 % text: ${seen.join("; ")}.`;
}
