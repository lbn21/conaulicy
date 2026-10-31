// Checks that the web font arriving late moves nothing: on the home page, an
// address page and its waste and water subpages, and /szukaj with one result
// (whose placeholder, components/search-skeleton.tsx, reserves one result:
// its swap for the results moves nothing either), at 360px, 375px (where the
// breadcrumbs once wrapped differently) and 1280px, every font request is
// held back 1.5s (a slow first visit) and the summed layout shift, including
// shifts CLS itself would forgive, must stay under 0.001. (0.01 is too loose:
// the 28px jump of the search section on / at 1280px scored only 0.0071.)
//
// The fixture's names never sit near a line's edge, but real ones do: then
// every TERYT place (lib/zuk-places.generated.ts), as the address page's h1
// and its subpage's breadcrumbs, is laid out while the font is held back and
// again once it has arrived, at each width; no height may change. (With
// font-display "swap", 6 breadcrumbs at 375px wrapped onto one line more or
// less; app/fonts.ts.)
// Run after `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { ZUK_PLACES } from "../lib/zuk-places.generated.ts";
import { finish, startServer } from "./lib/server.mjs";

const PAGES = [
  "/",
  "/adres/0972447-00470",
  "/adres/0972447-00470/smieci",
  "/adres/0972447-00470/woda",
  "/szukaj?q=as",
];
const WIDTHS = [360, 375, 1280];
const FONT_DELAY = 1500;
const LIMIT = 0.001;

// Each place's breadcrumbs on a subpage and its h1, roughly as
// components/place-page.tsx PlaceBreadcrumbs builds them.
const LOCALITY = new Map(ZUK_PLACES.localities.map((l) => [l.id, l]));
const NAMES = [
  ...ZUK_PLACES.streets.map((s) => [
    LOCALITY.get(s.localityId).name,
    `${s.cecha} ${s.name}`,
  ]),
  ...ZUK_PLACES.localities.map((l) => [
    l.parentId ? LOCALITY.get(l.parentId).name : "Gmina Lubaczów",
    l.name,
  ]),
];
const CLONED = [
  { path: "/adres/0972447-00470", selector: "h1" },
  { path: "/adres/0972447-00470/smieci", selector: ".govuk-breadcrumbs" },
];

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
      const held = await holdFonts(page);
      await page.goto(`${server.origin}${path}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      // Let the swap render and any late shift be reported.
      await page.waitForTimeout(500);
      const shifts = await page.evaluate(() => window.__shifts);
      const total = shifts.reduce((sum, s) => sum + s.value, 0);
      const label = `${path} ${width}px`;
      results.push(
        `${label}: layout shift ${total.toFixed(4)} (${held.count} font files held back)`,
      );
      if (held.count === 0) failures.push(`${label}: no font request seen`);
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

  for (const { path, selector } of CLONED) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
      });
      const page = await context.newPage();
      // The fonts wait until the names are laid out without them.
      let release;
      const measured = new Promise((resolve) => {
        release = resolve;
      });
      const held = await holdFonts(page, measured);
      await page.goto(`${server.origin}${path}`, {
        waitUntil: "domcontentloaded",
      });
      // A copy of the element per name, out of the flow, as wide as it.
      const before = await page.evaluate(
        ({ selector, names }) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          const holder = document.createElement("div");
          holder.id = "check-fonts-names";
          holder.style.cssText = `position:absolute;top:0;left:${box.left}px;width:${box.width}px;visibility:hidden`;
          document.body.append(holder);
          for (const name of names) {
            const copy = element.cloneNode(true);
            const links = copy.querySelectorAll("a");
            if (links.length === 3) {
              links[1].textContent = name[0];
              links[2].textContent = name[1];
            } else copy.textContent = name[1];
            holder.append(copy);
          }
          const loaded = [...document.fonts].some(
            (font) =>
              font.status === "loaded" && !/fallback/i.test(font.family),
          );
          return {
            loaded,
            heights: [...holder.children].map(
              (copy) => copy.getBoundingClientRect().height,
            ),
          };
        },
        { selector, names: NAMES },
      );
      // As late as a slow first visit's fonts.
      await page.waitForTimeout(FONT_DELAY);
      release();
      await page.waitForLoadState("load");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() =>
        [...document.getElementById("check-fonts-names").children].map(
          (copy) => copy.getBoundingClientRect().height,
        ),
      );
      const label = `${path} ${selector} ${width}px`;
      const moved = NAMES.filter((_, i) => before.heights[i] !== after[i]).map(
        (name) => name.join(" › "),
      );
      results.push(
        `${label}: ${NAMES.length} names, ${moved.length} change height (${held.count} font files held back)`,
      );
      if (before.loaded) failures.push(`${label}: the font was not held back`);
      if (held.count === 0) failures.push(`${label}: no font request seen`);
      if (moved.length > 0) {
        failures.push(
          `${label}: ${moved.length} names change height when the font arrives\n${moved.map((name) => `    ${name}`).join("\n")}`,
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

/**
 * Holds back every font request, counting them: FONT_DELAY, or with
 * `until`, until that promise settles.
 */
async function holdFonts(page, until) {
  const held = { count: 0 };
  await page.route(/\.woff2(\?|$)/, async (route) => {
    held.count += 1;
    await (until ?? new Promise((resolve) => setTimeout(resolve, FONT_DELAY)));
    await route.continue();
  });
  return held;
}

console.log(results.join("\n"));
finish(
  failures,
  `Fonts: no layout shift when they arrive late (limit ${LIMIT}).`,
);
