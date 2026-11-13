// A fresh Chromium page for each width and each case (soft-nav,
// field-link): `run(page, value, at)` with the case's value and its name
// for failures („click at 390”); a thrown error is that case's failure.
// The cases run returned true for, as „name@width”.
export async function eachPage(failures, widths, cases, run) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const passed = [];
  try {
    for (const width of widths)
      for (const [name, value] of Object.entries(cases)) {
        const at = `${name} at ${width}`;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: "reduce",
        });
        try {
          if (await run(await context.newPage(), value, at))
            passed.push(`${name}@${width}`);
        } catch (error) {
          failures.push(`${at}: ${error.message.split("\n")[0]}`);
        } finally {
          await context.close();
        }
      }
  } finally {
    await browser.close();
  }
  return passed;
}
