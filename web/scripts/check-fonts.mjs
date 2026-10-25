// Checks that the web font arriving late moves nothing: on the home page, an
// address page and its waste subpage, at 360px and 1280px, every font request is
// held back 1.5s (a slow first visit) and the summed layout shift, including
// shifts CLS itself would forgive, must stay under 0.001. (0.01 is too loose:
// the 28px jump of the search section on / at 1280px scored only 0.0071.)
// Run after `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { finish, startServer } from "./lib/server.mjs";

const PAGES = ["/", "/adres/0972447-00470", "/adres/0972447-00470/smieci"];
const WIDTHS = [360, 1280];
const FONT_DELAY = 1500;
const LIMIT = 0.001;

const server = await startServer(3306);
const browser = await chromium.launch();
const failures = [];
const results = [];

try {
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
      });
      await context.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__shifts.push({
              value: entry.value,
              sources: entry.sources.map((s) => {
                const node = s.node;
                const name = node
                  ? node.nodeType === 1
                    ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${node.className && typeof node.className === "string" ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""}`
                    : `#text "${node.textContent.trim().slice(0, 30)}"`
                  : "(removed)";
                const r = (rect) =>
                  `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
                return `${name} ${r(s.previousRect)} → ${r(s.currentRect)}`;
              }),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await context.newPage();
      let fonts = 0;
      await page.route(/\.woff2(\?|$)/, async (route) => {
        fonts += 1;
        await new Promise((resolve) => setTimeout(resolve, FONT_DELAY));
        await route.continue();
      });
      await page.goto(`${server.origin}${path}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      // Let the swap render and any late shift be reported.
      await page.waitForTimeout(500);
      const shifts = await page.evaluate(() => window.__shifts);
      const total = shifts.reduce((sum, s) => sum + s.value, 0);
      const label = `${path} ${width}px`;
      results.push(
        `${label}: layout shift ${total.toFixed(4)} (${fonts} font files held back)`,
      );
      if (fonts === 0) failures.push(`${label}: no font request seen`);
      if (total >= LIMIT) {
        failures.push(
          `${label}: layout shift ${total.toFixed(4)}\n${shifts
            .map(
              (s) =>
                `    ${s.value.toFixed(4)}\n${s.sources.map((x) => `      ${x}`).join("\n")}`,
            )
            .join("\n")}`,
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

console.log(results.join("\n"));
finish(
  failures,
  `Fonts: no layout shift when they arrive late (limit ${LIMIT}).`,
);
