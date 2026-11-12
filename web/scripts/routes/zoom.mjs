// What a lint cannot see (t366 section 6): tokens arranged to stand in for
// a line's height hold at 100 % and break when the text grows. At 200 %
// text size (the root's font size doubled, as a browser's text-only zoom;
// GOV.UK's type is in rem), at 390 and 1280 px, on the CI fixture's town
// street:
//   - every timeline dot's centre within 1 px of its date line's centre
//     (the address page);
//   - the h1's icon tile's centre within 1 px of the h1's first line's cap
//     centre (a subpage), at 100 % as well: the h1 is a flex row, its tile
//     one line tall (t366's C1, t369).
// The cap centre: the first character's baseline (its text box's top plus
// the font's ascent, from canvas metrics) less half the cap height of „H”.

const WIDTHS = [390, 1280];
const TOLERANCE = 1;
const PLACE = "/adres/0972447-00470";
const TILE_EXPECTED_TO_FAIL = false;

async function open(browser, url, width, scale = "200%") {
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
  });
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, scale);
  return page;
}

/** Each dot's centre less its date line's centre, in px. */
const dots = (page) =>
  page.$$eval(".app-timeline > li", (items) =>
    items.map((li) => {
      const dot = li
        .querySelector(".app-timeline__dot")
        .getBoundingClientRect();
      const title = li.querySelector(".app-timeline__title");
      const centre = dot.top + dot.height / 2;
      const line =
        title.getBoundingClientRect().top +
        Number.parseFloat(getComputedStyle(title).lineHeight) / 2;
      return centre - line;
    }),
  );

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
      const hub = await open(browser, `${server.origin}${PLACE}`, width);
      const offsets = await dots(hub);
      if (offsets.length === 0)
        failures.push(`${PLACE} at ${width}: no timeline dot`);
      offsets.forEach((d, i) => {
        if (Math.abs(d) > TOLERANCE)
          failures.push(
            `${PLACE} at ${width}, 200 %: dot ${i + 1} is ${d.toFixed(2)} px off its date line's centre`,
          );
      });
      seen.push(
        `${width}: ${offsets.length} dots, worst ${Math.max(...offsets.map(Math.abs)).toFixed(2)} px`,
      );

      for (const scale of ["100%", "200%"]) {
        const sub = await open(
          browser,
          `${server.origin}${PLACE}/smieci`,
          width,
          scale,
        );
        const d = await tile(sub);
        const off = Math.abs(d) > TOLERANCE;
        if (off && !TILE_EXPECTED_TO_FAIL)
          failures.push(
            `${PLACE}/smieci at ${width}, ${scale}: the h1's tile is ${d.toFixed(2)} px off its cap centre`,
          );
        if (!off && TILE_EXPECTED_TO_FAIL)
          failures.push(
            `${PLACE}/smieci at ${width}, ${scale}: the h1's tile is centred (${d.toFixed(2)} px): set TILE_EXPECTED_TO_FAIL false`,
          );
        seen.push(`${width}, ${scale}: h1 tile ${d.toFixed(2)} px`);
      }
    }
  } finally {
    await browser.close();
  }
  return `zoom: ${seen.join("; ")}.`;
}
