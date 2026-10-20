// Checks the address search (alphagov accessible-autocomplete, which takes
// over the field on first focus) on the home page at 360px and 1280px: the
// result popup overlays the page (nothing below the field moves while it loads,
// lists results, says "Brak wyników" or closes), follows the APG combobox
// keyboard model, and its rows use the field's font at GOV.UK's size 19.
// Matching runs on the device: the index loads once, on focus, and typing
// makes no request. Also: "ul" alone asks for a name, "Zmień adres" on a
// street page lands on an empty, focused field with the list closed,
// /api/search answers when the index cannot load, and a house number
// ("kosciuszki 7a") reaches the street page, which picks the part of a split
// street by it, or asks for it (also without JS). Run after `next build`;
// needs Playwright's Chromium.
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
        ["#sample-heading", "main section ul", "footer"].map((selector) => {
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

    // accessible-autocomplete's "no results" row carries its notes; real
    // results are the options that are not disabled.
    const note = (text) =>
      page.locator(".autocomplete__option--no-results", { hasText: text });
    const result = () => page.locator('[role="option"]:not([aria-disabled])');
    // Every row of the popup (results and notes) uses GOV.UK's type, as the
    // field (never the browser default), at GOV.UK's form-control size, 19.
    const sameType = async (rows, state) => {
      const family = (el) => getComputedStyle(el).fontFamily;
      const [field, row, size] = await Promise.all([
        page.locator("#adres").evaluate(family),
        rows.first().evaluate(family),
        rows.first().evaluate((el) => getComputedStyle(el).fontSize),
      ]);
      check(
        row === field && size === "19px",
        `${label} ${state}: option font ${row} ${size}, expected ${field} 19px`,
      );
    };
    // The field is a plain input until first focus loads the library.
    await page.locator("#adres").click();
    const input = page.getByRole("combobox");
    const listbox = page.getByRole("listbox");
    await input.waitFor();
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
    await sameType(note("Szukam…"), "loading");

    await result().first().waitFor();
    await same("results");
    await sameType(result(), "results");
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
    const rows = await result().evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    );
    // accessible-autocomplete's own rows; at least WCAG 2.2's target size.
    check(Math.min(...rows) >= 24, `${label}: option shorter than 24px`);

    // Before Escape: accessible-autocomplete shows its "no results" row only
    // while it counts the field as focused, and Escape clears that until the
    // field is focused again (library behaviour, unchanged).
    await input.fill("qqqq");
    await note("Brak wyników").waitFor();
    await same("no results");
    await sameType(note("Brak wyników"), "no results");
    await input.fill("a");
    await result().first().waitFor();

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
    // After Escape, accessible-autocomplete keeps its "focused" state cleared
    // until the field is focused again, and until then a click outside does
    // not close the list (library behaviour, unchanged). Focus it again, as
    // a user returning to the field would.
    await page.locator("h1").click();
    await input.focus();

    await input.fill("asnyka");
    await result().first().waitFor();
    await page.locator("h1").click();
    check(
      !(await listbox.isVisible()),
      `${label}: click outside does not close the popup`,
    );
    await same("closed by a click outside");

    await input.focus();
    await result().first().waitFor();

    await input.fill("ul.");
    await note("Wpisz nazwę ulicy").waitFor();
    await same("only ul.");
    await input.fill("");
    await input.pressSequentially("slowac", { delay: 50 });
    await result().first().waitFor();
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

  // "Zmień adres" on a street page: an empty, focused field, list closed,
  // and nothing moves.
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.addInitScript(() => {
    window.__shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__shift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${server.origin}/adres/0972447-00470`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("link", { name: /^Zmień adres/ }).click();
  await page.waitForURL(`${server.origin}/#szukaj`);
  const input = page.getByRole("combobox");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "combobox",
  );
  await page.waitForTimeout(500);
  const state = await input.evaluate((el) => ({
    value: el.value,
    expanded: el.getAttribute("aria-expanded"),
    fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
    shift: window.__shift,
  }));
  check(
    state.value === "" && state.expanded === "false",
    `Zmień adres: field not empty or list open (${JSON.stringify(state)})`,
  );
  check(
    state.fontSize >= 16,
    `Zmień adres: field text ${state.fontSize}px, phones zoom in below 16px`,
  );
  check(state.shift === 0, `Zmień adres: layout shift ${state.shift}`);
  await page.close();

  // A house number: typed after the street, carried to the page.
  const house = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  await house.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await house.locator("#adres").click();
  await house.getByRole("combobox").pressSequentially("kosciuszki 7A");
  const option = house.locator('[role="option"]:not([aria-disabled])').first();
  await option.waitFor();
  check(
    (await option.textContent()) === "ul. Tadeusza Kościuszki 7a, Lubaczów",
    `house number: option reads "${await option.textContent()}"`,
  );
  await house.getByRole("combobox").press("Enter");
  await house.waitForURL(`${server.origin}/adres/0972447-90004?nr=7a`);
  const heading = await house.locator("h1").textContent();
  const sector = await house.locator('a[href^="/ics/"]').getAttribute("href");
  check(
    heading === "ul. Tadeusza Kościuszki 7a" &&
      sector === "/ics/waste%3Amiasto-s2",
    `house number: heading "${heading}", calendar ${sector} (odd: sektor 2)`,
  );
  check(
    (await house.getByRole("link", { name: /PDF/ }).getAttribute("href")) ===
      "/adres/0972447-90004/harmonogram.pdf?nr=7a",
    "house number: PDF link without ?nr=",
  );
  await house.close();

  // A split street without a number asks for it, with no JS at all.
  const plain = await browser.newContext({ javaScriptEnabled: false });
  const ask = await plain.newPage();
  await ask.goto(`${server.origin}/adres/0972447-90004`);
  check(
    (await ask.locator('a[href^="/ics/"]').count()) === 0,
    "split street: a calendar link before the number is known",
  );
  await ask.getByLabel("Jaki jest numer domu?").fill("12");
  await ask.getByRole("button", { name: "Pokaż odbiory" }).click();
  await ask.waitForURL(`${server.origin}/adres/0972447-90004?nr=12`);
  check(
    (await ask.locator('a[href^="/ics/"]').getAttribute("href")) ===
      "/ics/waste%3Amiasto-s1",
    "split street: 12 (even) not in sektor 1",
  );
  // Valid numbers pick their part of the street, with no error.
  for (const [nr, zone] of [
    ["12", "s1"],
    ["12a", "s1"],
    ["7/22", "s2"],
  ]) {
    await ask.goto(`${server.origin}/adres/0972447-90004?nr=${nr}`);
    const href = await ask.locator('a[href^="/ics/"]').getAttribute("href");
    check(
      href === `/ics/waste%3Amiasto-${zone}` &&
        (await ask.locator(".govuk-error-summary").count()) === 0 &&
        !(await ask.title()).startsWith("Błąd"),
      `split street ?nr=${nr}: calendar ${href}, expected sektor ${zone} and no error`,
    );
  }

  // The GOV.UK validation pattern, without JS too: "Błąd: " title, error
  // summary linking to the field, error message, error styles.
  const MISSING = "Wpisz numer domu, na przykład 12, 12a albo 7/22";
  const UNKNOWN =
    "Numeru 42 nie ma w harmonogramie tej ulicy. Sprawdź numer albo harmonogram gminy";
  for (const [query, message] of [
    ["", MISSING],
    ["abc", MISSING],
    ["42", UNKNOWN],
  ]) {
    await ask.goto(`${server.origin}/adres/0972447-90004?nr=${query}`);
    const state = await ask.evaluate(() => ({
      title: document.title,
      summary: document.querySelector(
        '.govuk-error-summary[data-module="govuk-error-summary"] [role="alert"] .govuk-error-summary__title',
      )?.textContent,
      link: document.querySelector(".govuk-error-summary__list a")
        ? {
            href: document
              .querySelector(".govuk-error-summary__list a")
              .getAttribute("href"),
            text: document.querySelector(".govuk-error-summary__list a")
              .textContent,
          }
        : null,
      message: document.querySelector("#nr-error.govuk-error-message")
        ?.textContent,
      group: document
        .querySelector(".govuk-form-group")
        ?.classList.contains("govuk-form-group--error"),
      input: document.querySelector("#nr")?.className,
      describedBy: document
        .querySelector("#nr")
        ?.getAttribute("aria-describedby"),
      novalidate: document.querySelector("form")?.hasAttribute("novalidate"),
    }));
    check(
      state.title.startsWith("Błąd: ") &&
        state.summary === "Jest problem" &&
        state.link?.href === "#nr" &&
        state.link?.text === message &&
        state.message === `Błąd: ${message}` &&
        state.group &&
        state.input?.includes("govuk-input--error") &&
        state.describedBy === "nr-hint nr-error" &&
        state.novalidate,
      `split street ?nr=${query}: error pattern wrong ${JSON.stringify(state)}`,
    );
  }
  await ask.goto(`${server.origin}/adres/0972447-00470?nr=bzdura`);
  check(
    (await ask.locator("h1").textContent()) === "ul. Adama Asnyka",
    "invalid nr: not ignored",
  );
  await plain.close();

  // A page with a number is cached like the plain one (ISR, not dynamic),
  // also on a split street after its error pages were served: the error has
  // its own path (/numer, or the unknown number's own), never a valid one's.
  for (const query of ["", "abc", "42"]) {
    await fetch(`${server.origin}/adres/0972447-90004?nr=${query}`);
  }
  for (const page of ["0972447-00470?nr=12", "0972447-90004?nr=12"]) {
    const url = `${server.origin}/adres/${page}`;
    await fetch(url);
    const res = await fetch(url);
    const cached = res.headers.get("x-nextjs-cache");
    const html = await res.text();
    check(
      cached === "HIT" && !html.includes("govuk-error-summary"),
      `${page}: not cached or shows an error (x-nextjs-cache: ${cached})`,
    );
  }

  // With JS, GOV.UK's ErrorSummary takes focus on load (so it is announced),
  // and its link moves focus to the field.
  const withJs = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  await withJs.goto(`${server.origin}/adres/0972447-90004?nr=`, {
    waitUntil: "networkidle",
  });
  await withJs
    .waitForFunction(
      () => document.activeElement?.classList.contains("govuk-error-summary"),
      null,
      { timeout: 5000 },
    )
    .catch(() => check(false, "error summary: not focused on load"));
  await withJs.locator(".govuk-error-summary__list a").click();
  check(
    (await withJs.evaluate(() => document.activeElement?.id)) === "nr",
    "error summary: its link does not focus the field",
  );
  await withJs.close();

  // No index (blocked or broken): the server answers instead.
  const fallback = await browser.newPage();
  await fallback.route("**/api/search-index/**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await fallback.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await fallback.locator("#adres").click();
  await fallback.getByRole("combobox").pressSequentially("asnyka");
  await fallback
    .getByRole("option", { name: /Asnyka/ })
    .waitFor({ timeout: 5000 })
    .catch(() => check(false, "fallback: /api/search did not answer"));
  await fallback.close();

  // Typing straight after focus, before accessible-autocomplete has loaded,
  // on Slow 4G + 4× CPU (as check-perf): no page error, the field stays,
  // nothing typed is lost and the results appear. At 0 ms per key typing
  // must end before the library mounts, so that path is really covered.
  for (const delay of [0, 60, 150]) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const early = await context.newPage();
    const errors = [];
    early.on("pageerror", (error) => errors.push(error.message));
    await early.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    const cdp = await context.newCDPSession(early);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1475 * 1024) / 8,
      uploadThroughput: (675 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const field = early.locator("#adres");
    await field.click();
    await field.pressSequentially("asnyka", { delay });
    // The field vanishing (the #33 bug) must fail the check, not hang it.
    const mounted = await field
      .evaluate((el) => el.hasAttribute("aria-expanded"), null, {
        timeout: 2000,
      })
      .catch(() => "missing");
    if (delay === 0) {
      check(
        mounted === false,
        `early typing: the field was ${mounted === "missing" ? "gone" : "already the library's"} when typing ended`,
      );
    }
    await early
      .locator('[role="option"]:not([aria-disabled])', { hasText: "Asnyka" })
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    const state = {
      errors,
      fields: await early.locator("#adres").count(),
      value: await early
        .locator("#adres")
        .inputValue()
        .catch(() => null),
      results: await early
        .locator('[role="option"]:not([aria-disabled])')
        .allTextContents(),
    };
    check(
      state.errors.length === 0 &&
        state.fields === 1 &&
        state.value === "asnyka" &&
        state.results.some((text) => text.includes("Asnyka")),
      `early typing at ${delay} ms per key: ${JSON.stringify(state)}`,
    );
    await context.close();
  }
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
