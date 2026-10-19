// Checks the address search on the home page at 360px and 1280px: the result
// popup overlays the page (nothing below the field moves while it loads,
// lists results, says "Brak wyników" or closes) and follows the APG combobox
// keyboard model. Matching runs on the device: the index loads once, on
// focus, and typing makes no request. Also: "ul" alone asks for a name,
// /?q= fills and focuses the field, and /api/search answers when the index
// cannot load. Run after `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { startServer } from "./lib/server.mjs";

const WIDTHS = [360, 1280];

const server = await startServer(3302);
const browser = await chromium.launch();
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    // Slow the index down a little so the loading state is visible.
    const requests = { index: 0, search: 0 };
    await page.route("**/api/search-index/**", async (route) => {
      requests.index += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.route("**/api/search?**", (route) => {
      requests.search += 1;
      return route.continue();
    });
    // Typing before hydration would be lost, so wait for the scripts.
    await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState === "finished"),
    );

    // Every layout shift, including those right after input (which CLS itself
    // would forgive).
    await page.evaluate(() => {
      window.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__shift += entry.value;
      }).observe({ type: "layout-shift" });
    });

    // Page positions (not viewport: focusing may scroll) of what follows the field.
    const below = () =>
      page.evaluate(() =>
        [
          "#sample-heading",
          "main section ul",
          "footer",
          "search form > p[role=status]",
        ].map((selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return `${selector} ${Math.round(r.left)},${Math.round(r.top + window.scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
      );
    const before = await below();
    const label = `${width}px`;
    const same = async (state) => {
      const now = await below();
      check(
        JSON.stringify(now) === JSON.stringify(before),
        `${label} ${state}: content below the field moved\n  before ${before.join("\n         ")}\n  after  ${now.join("\n         ")}`,
      );
    };

    // The visible note in the popup (the live region repeats it, unseen).
    const note = (text) =>
      page.locator('search p[aria-hidden="true"]', { hasText: text });
    const input = page.getByRole("combobox");
    const listbox = page.getByRole("listbox");
    await input.click();
    if (width < 768) {
      // Near the top, or as far as the page can scroll.
      const { top, room } = await input.evaluate((el) => ({
        top: el.getBoundingClientRect().top,
        room:
          document.documentElement.scrollHeight -
          window.innerHeight -
          window.scrollY,
      }));
      check(
        top < 80 || room < 1,
        `${label}: focused field not scrolled near the top (${top}px, ${room}px more to scroll)`,
      );
    }

    await input.pressSequentially("a");
    await note("Szukam…").waitFor();
    await same("loading");

    await page.getByRole("option").first().waitFor();
    await same("results");
    check(
      (await input.getAttribute("aria-expanded")) === "true",
      `${label}: aria-expanded not true with results`,
    );
    const [field, popup] = await Promise.all([
      input.boundingBox(),
      listbox.boundingBox(),
    ]);
    check(
      Math.abs(field.width - popup.width) <= 4 &&
        popup.y >= field.y + field.height,
      `${label}: popup not anchored below the field at its width`,
    );
    const rows = await page
      .getByRole("option")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    check(Math.min(...rows) >= 48, `${label}: option shorter than 48px`);

    await input.press("ArrowDown");
    const activeId = await input.getAttribute("aria-activedescendant");
    check(
      activeId &&
        (await page
          .locator(`[id="${activeId}"]`)
          .getAttribute("aria-selected")) === "true",
      `${label}: ArrowDown does not set aria-activedescendant`,
    );

    await input.press("Escape");
    check(
      (await input.getAttribute("aria-expanded")) === "false" &&
        !(await listbox.isVisible()),
      `${label}: Escape does not close the popup`,
    );
    await same("closed with Escape");

    await input.fill("qqqq");
    await note("Brak wyników").waitFor();
    await same("no results");

    await input.fill("asnyka");
    await page.getByRole("option").first().waitFor();
    await page.locator("h1").click();
    check(
      !(await listbox.isVisible()),
      `${label}: click outside does not close the popup`,
    );
    await same("closed by a click outside");

    await input.focus();
    await page.getByRole("option").first().waitFor();

    await input.fill("ul.");
    await note("Wpisz nazwę ulicy").waitFor();
    await same("only ul.");
    await input.fill("");
    await input.pressSequentially("slowac", { delay: 50 });
    await page.getByRole("option").first().waitFor();
    check(
      requests.index === 1 && requests.search === 0,
      `${label}: expected 1 index request and no /api/search, got ${requests.index} and ${requests.search}`,
    );
    await input.press("Tab");
    check(
      !(await input.evaluate((el) => el === document.activeElement)) &&
        !(await listbox.isVisible()),
      `${label}: Tab does not move on and close the popup`,
    );

    const shift = await page.evaluate(() => window.__shift);
    check(
      shift === 0,
      `${label}: layout shift ${shift.toFixed(4)} while typing`,
    );
    console.log(`${label}: layout shift ${shift}`);
    await page.close();
  }

  // "Zmień adres" on a street page: /?q=<name> fills and focuses the field.
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(
    `${server.origin}/?q=${encodeURIComponent("ul. Adama Asnyka")}`,
    {
      waitUntil: "networkidle",
    },
  );
  const input = page.getByRole("combobox");
  await page.getByRole("option").first().waitFor();
  check(
    (await input.inputValue()) === "ul. Adama Asnyka" &&
      (await input.evaluate((el) => el === document.activeElement)),
    "/?q=: field not filled and focused",
  );
  await page.close();

  // No index (blocked or broken): the server answers instead.
  const fallback = await browser.newPage();
  await fallback.route("**/api/search-index/**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await fallback.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await fallback.getByRole("combobox").pressSequentially("asnyka");
  await fallback
    .getByRole("option", { name: /Asnyka/ })
    .waitFor({ timeout: 5000 })
    .catch(() => check(false, "fallback: /api/search did not answer"));
  await fallback.close();
} finally {
  await browser.close();
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log("Search popup: no layout shift, combobox keyboard ok.");
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
