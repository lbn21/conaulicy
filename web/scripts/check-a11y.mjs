// Runs axe-core on every key route at 360px and 1280px (light only, as GOV.UK).
// Fails on any WCAG 2.0/2.1/2.2 A or AA violation, and on a page whose
// #main-content is not exactly one visible <main> (the skip link's target)
// or that uses an id twice. Run after `next build`;
// needs Playwright's Chromium (`npx playwright install chromium`).
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { mainAndIds, ROUTES, startServer } from "./lib/server.mjs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const WIDTHS = [360, 1280];

const server = await startServer(3301);
const browser = await chromium.launch();
let failures = 0;
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(server.origin + route.path, { waitUntil: "load" });
      // Measure final colours, not a frame of the fade-in.
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState === "finished"),
      );
      // Check collapsed content too.
      await page.evaluate(() => {
        for (const details of document.querySelectorAll("details")) {
          details.open = true;
        }
      });
      const { violations, passes } = await new AxeBuilder({ page })
        .withTags(TAGS)
        .analyze();
      const label = `${route.path} [${width}px]`;
      const ids = await mainAndIds(page);
      if (ids.mains !== 1 || !ids.main || ids.duplicates.length > 0) {
        failures += 1;
        console.log(`FAIL  ${label}  main and ids ${JSON.stringify(ids)}`);
      }
      if (violations.length === 0) {
        console.log(`ok    ${label}  (${passes.length} rules passed)`);
        continue;
      }
      failures += violations.length;
      console.log(`FAIL  ${label}`);
      for (const v of violations) {
        console.log(`  ${v.id} (${v.impact}): ${v.help}`);
        for (const node of v.nodes.slice(0, 5)) {
          console.log(`    ${node.target.join(" ")}`);
          if (node.failureSummary) {
            console.log(
              `      ${node.failureSummary.replace(/\n\s*/g, " / ")}`,
            );
          }
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

console.log(`\n${failures} violations (${TAGS.join(", ")}).`);
process.exit(failures > 0 ? 1 : 0);
