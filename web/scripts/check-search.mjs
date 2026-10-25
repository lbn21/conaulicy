// Checks the address search (alphagov accessible-autocomplete, which takes
// over the field once the page is idle) on the home page at 360px and 1280px: the
// result popup overlays the page (nothing below the field moves while it loads,
// lists results, says "Brak wyników" or closes), follows the APG combobox
// keyboard model, and its rows use the field's font family and size.
// Matching runs on the device: the index loads once, when the page is idle
// after load or on focus if that comes first (only on focus with
// Save-Data), and typing makes no request. Also: "ul" alone asks for a name, "Zmień adres" on a
// street page lands on an empty, focused field with the list closed,
// /api/search answers when the index cannot load, and a house number
// ("kosciuszki 7a") reaches the street page, which picks the part of a split
// street by it, or asks for it (also without JS). Picking a suggestion (a
// tap, or ArrowDown and Enter) only fills the field and closes the list, as
// GOV.UK's default; „Szukaj” or the next Enter submits the form, and
// /szukaj opens the picked place, also with a house number typed after it.
// The search form works without JS (one clearly best place: its page;
// otherwise /szukaj lists them), and with JS, Enter with no suggestion
// submits it. /szukaj, /api/search and lib/search.ts rank alike. /szukaj
// has the same field, prefilled once, with its error state. Run after
// `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { matcher, placeHref } from "../lib/search.ts";
import { finish, startServer } from "./lib/server.mjs";

const WIDTHS = [360, 1280];

// Counts the page's requests for the search index.
function countIndex(page) {
  const counter = { count: 0 };
  page.on("request", (request) => {
    if (request.url().includes("/api/search-index/")) counter.count += 1;
  });
  return counter;
}

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
    // Hold the index until the first letter is typed, so the loading state
    // is visible.
    const requests = { index: 0, search: 0 };
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let requested;
    const indexRequested = new Promise((resolve) => {
      requested = resolve;
    });
    await page.route("**/api/search-index/**", async (route) => {
      requests.index += 1;
      requested();
      await held;
      await route.continue();
    });
    await page.route("**/api/search?**", (route) => {
      requests.search += 1;
      return route.continue();
    });
    // The index loads once the page is idle, with no focus (and only after
    // hydration, so typing is not lost).
    await page.goto(`${server.origin}/`, { waitUntil: "load" });
    await Promise.race([
      indexRequested,
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
    check(
      requests.index === 1,
      `${width}px: the index was not requested without focus once idle`,
    );
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
    // Every row of the popup (results and notes) uses the field's font family
    // and size (GOV.UK's family, the library's sizes), never the browser default.
    const type = (el) => {
      const style = getComputedStyle(el);
      return `${style.fontFamily} ${style.fontSize}`;
    };
    const sameType = async (rows, state) => {
      const [field, row] = await Promise.all([
        page.locator("#adres").evaluate(type),
        rows.first().evaluate(type),
      ]);
      check(
        row === field,
        `${label} ${state}: option font ${row}, field ${field}`,
      );
    };
    await page.locator("#adres").click();
    const input = page.getByRole("combobox");
    const listbox = page.getByRole("listbox");
    await input.waitFor();

    await input.pressSequentially("a");
    await note("Szukam…").waitFor();
    await same("loading");
    await sameType(note("Szukam…"), "loading");
    release();

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

  // "Zmień adres" on a street page: back to the home page (no hash), an
  // empty field that is not focused, and nothing moves. A real tap then
  // focuses it, with the list closed until typing.
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
  await page.waitForURL(`${server.origin}/`);
  await page.waitForTimeout(500);
  const state = await page.locator("#adres").evaluate((el) => ({
    url: window.location.href,
    value: el.value,
    focused: document.activeElement === el,
    fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
    shift: window.__shift,
  }));
  check(
    !state.url.includes("#"),
    `Zmień adres: landed on ${state.url}, expected no hash`,
  );
  check(
    state.value === "" && !state.focused,
    `Zmień adres: field not empty or focused without a tap (${JSON.stringify(state)})`,
  );
  check(
    state.fontSize >= 16,
    `Zmień adres: field text ${state.fontSize}px, phones zoom in below 16px`,
  );
  check(state.shift === 0, `Zmień adres: layout shift ${state.shift}`);

  await page.locator("#adres").click();
  const input = page.getByRole("combobox");
  await input.waitFor();
  await page.waitForTimeout(500);
  const tapped = await input.evaluate((el) => ({
    focused: document.activeElement === el,
    expanded: el.getAttribute("aria-expanded"),
    listbox: document.querySelector('[role="listbox"]')?.checkVisibility(),
  }));
  check(
    tapped.focused && tapped.expanded === "false" && !tapped.listbox,
    `Zmień adres: a tap does not focus the field, or the list opens before typing (${JSON.stringify(tapped)})`,
  );
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
  // ArrowDown, Enter: the field holds the suggestion, the page stays; the
  // next Enter submits the form.
  await house.getByRole("combobox").press("ArrowDown");
  await house.getByRole("combobox").press("Enter");
  await house.waitForTimeout(500);
  const picked = {
    url: house.url(),
    value: await house.getByRole("combobox").inputValue(),
    list: await house.getByRole("listbox").isVisible(),
  };
  check(
    picked.url === `${server.origin}/` &&
      picked.value === "ul. Tadeusza Kościuszki 7a, Lubaczów" &&
      !picked.list,
    `house number: ArrowDown, Enter does not only fill the field ${JSON.stringify(picked)}`,
  );
  await house.getByRole("combobox").press("Enter");
  await house.waitForURL(`${server.origin}/adres/0972447-90004?nr=7a`);
  const heading = await house.locator("h1").textContent();
  // The calendar and the PDF are on the waste subpage, its section's
  // „Wszystkie odbiory śmieci”, with the number.
  await house
    .locator('section[aria-labelledby="smieci-heading"] a', {
      hasText: "Wszystkie odbiory śmieci",
    })
    .first()
    .click();
  await house.waitForURL(`${server.origin}/adres/0972447-90004/smieci?nr=7a`);
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

  // A tap (phone) or click on a suggestion fills the field and closes the
  // list, uncovering „Szukaj”; the page stays until it is pressed. "adama"
  // finds two places; the picked one's text opens it.
  for (const [width, touch] of [
    [360, true],
    [1280, false],
  ]) {
    const how = touch ? "tap" : "click";
    const pick = await browser.newPage({
      viewport: { width, height: 800 },
      hasTouch: touch,
    });
    const press = (locator) => (touch ? locator.tap() : locator.click());
    await pick.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await press(pick.locator("#adres"));
    await pick.getByRole("combobox").pressSequentially("adama");
    const suggestion = pick
      .locator('[role="option"]:not([aria-disabled])', { hasText: "Asnyka" })
      .first();
    await suggestion.waitFor();
    await press(suggestion);
    await pick.waitForTimeout(500);
    const button = pick.getByRole("button", { name: "Szukaj" });
    const picked = {
      url: pick.url(),
      value: await pick.getByRole("combobox").inputValue(),
      list: await pick.getByRole("listbox").isVisible(),
      // The button is on top at its centre, no longer under the list.
      button: await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return el.contains(top);
      }),
    };
    check(
      picked.url === `${server.origin}/` &&
        picked.value === "ul. Adama Asnyka, Lubaczów" &&
        !picked.list &&
        picked.button,
      `${how} on a suggestion: does not only fill the field ${JSON.stringify(picked)}`,
    );
    await press(button);
    await pick
      .waitForURL(`${server.origin}/adres/0972447-00470`, { timeout: 5000 })
      .catch(() => check(false, `${how}, Szukaj: at ${pick.url()}`));
    await pick.close();
  }

  // A house number typed after a pick stays in the field (the library only
  // searches again, never overriding it) and reaches the place's page.
  const typed = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  await typed.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await typed.locator("#adres").click();
  const field = typed.getByRole("combobox");
  await field.pressSequentially("rynek");
  await typed
    .locator('[role="option"]:not([aria-disabled])', { hasText: "Rynek" })
    .first()
    .click();
  await field.pressSequentially(" 5");
  await typed.waitForTimeout(500);
  const value = await field.inputValue();
  check(
    value === "ul. Rynek, Lubaczów 5",
    `number typed after a pick: field reads "${value}"`,
  );
  await typed.getByRole("button", { name: "Szukaj" }).click();
  await typed
    .waitForURL(`${server.origin}/adres/0972447-19253?nr=5`, { timeout: 5000 })
    .catch(() => check(false, `number typed after a pick: at ${typed.url()}`));
  await typed.close();

  // Enter with no suggestion (none found) submits the form, as without JS.
  const enter = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  await enter.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await enter.locator("#adres").click();
  await enter.getByRole("combobox").pressSequentially("xyzqq");
  await enter
    .locator(".autocomplete__option--no-results", { hasText: "Brak wyników" })
    .waitFor();
  await enter.getByRole("combobox").press("Enter");
  await enter
    .waitForURL(`${server.origin}/szukaj?q=xyzqq`, { timeout: 5000 })
    .catch(() => check(false, `Enter with no results: at ${enter.url()}`));
  await enter.close();

  // /szukaj's field is the home page's, enhanced alike: it keeps what was
  // searched for, once, its suggestions are real places, and an empty search
  // keeps GOV.UK's error styles, with the error read first.
  const again = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  const againIndex = countIndex(again);
  await again.goto(`${server.origin}/szukaj?q=adama`, {
    waitUntil: "networkidle",
  });
  check(
    againIndex.count === 1,
    `/szukaj?q=adama: ${againIndex.count} index requests before focus, expected 1`,
  );
  await again.locator("#adres").click();
  const prefilled = again.getByRole("combobox");
  await prefilled.waitFor();
  const options = again.locator('[role="option"]:not([aria-disabled])');
  await options
    .filter({ hasText: "Asnyka" })
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => check(false, "/szukaj?q=adama: no suggestions on focus"));
  const texts = await options.allTextContents();
  check(
    (await prefilled.inputValue()) === "adama" &&
      (await again.locator('input[name="q"]').count()) === 1 &&
      !texts.includes("adama"),
    `/szukaj?q=adama enhanced: field "${await prefilled.inputValue()}", options ${JSON.stringify(texts)}`,
  );
  check(
    againIndex.count === 1,
    `/szukaj?q=adama: ${againIndex.count} index requests after focus, expected 1`,
  );
  await again.goto(`${server.origin}/szukaj?q=`, { waitUntil: "networkidle" });
  await again.locator("#adres").click();
  const errored = again.getByRole("combobox");
  await errored.waitFor();
  const enhanced = await errored.evaluate((el) => ({
    value: el.value,
    input: el.classList.contains("govuk-input--error"),
    group: Boolean(el.closest(".govuk-form-group--error")),
    hint: document
      .getElementById(el.getAttribute("aria-describedby") ?? "")
      ?.textContent?.startsWith("Błąd: Wpisz nazwę ulicy albo wsi."),
  }));
  check(
    Object.values(enhanced).every((v) => v === true || v === ""),
    `/szukaj?q= enhanced: ${JSON.stringify(enhanced)}`,
  );
  await again.close();

  // The same search everywhere: for each query, /szukaj's redirect (or its
  // first result), /api/search's first place and lib/search.ts's over the
  // served index all point at the same place and number.
  const home = await (await fetch(`${server.origin}/`)).text();
  const [indexPath] = home.match(/\/api\/search-index\/[0-9a-f]{16}/) ?? [];
  const index = await (await fetch(`${server.origin}${indexPath}`)).json();
  const match = matcher(index);
  for (const query of [
    "rynek",
    "Rynk",
    "adama",
    "Asnyka 12",
    "ul. Rynek 5, Lubaczów",
    "kosciuszki 7A",
    "slowac",
    "lesna lisie jamy",
    "dabrowa",
    "xyzqq",
  ]) {
    const q = encodeURIComponent(query);
    const [shared] = match(query).hits;
    const [api] = await (
      await fetch(`${server.origin}/api/search?q=${q}`)
    ).json();
    const res = await fetch(`${server.origin}/szukaj?q=${q}`, {
      redirect: "manual",
    });
    const location = res.headers.get("location");
    const target = location
      ? decodeURI(
          new URL(location, server.origin).href.slice(server.origin.length),
        )
      : ((await res.text()).match(
          /<main[\s\S]*?<ul class="govuk-list[^"]*">\s*<li><a href="([^"]+)"/,
        )?.[1] ?? null);
    const hrefs = [shared, api].map((hit) => (hit ? placeHref(hit) : null));
    check(
      hrefs[0] === hrefs[1] && hrefs[0] === target,
      `same search "${query}": module ${hrefs[0]}, /api/search ${hrefs[1]}, /szukaj ${target}`,
    );
  }

  // A split street without a number asks for it, with no JS at all.
  const plain = await browser.newContext({ javaScriptEnabled: false });
  // The home page's form without JS: one place opens its page; several are
  // listed on /szukaj.
  const form = await plain.newPage();
  for (const [query, url] of [
    ["rynek", "/adres/0972447-19253"],
    ["Asnyka 12", "/adres/0972447-00470?nr=12"],
    ["adama", "/szukaj?q=adama"],
  ]) {
    await form.goto(`${server.origin}/`);
    await form.getByLabel("Ulica albo wieś").fill(query);
    await form.getByRole("button", { name: "Szukaj" }).click();
    await form
      .waitForURL(`${server.origin}${url}`, { timeout: 5000 })
      .catch(() => check(false, `no-JS search "${query}": at ${form.url()}`));
  }
  check(
    (await form.locator("main ul.govuk-list a").count()) === 2,
    "no-JS search adama: not 2 results",
  );
  await form.close();
  const ask = await plain.newPage();
  // The address page asks for the number on its waste card, linking the
  // waste subpage's question; the answer opens the address page with it.
  await ask.goto(`${server.origin}/adres/0972447-90004`);
  check(
    (await ask.locator('a[href^="/ics/"]').count()) === 0,
    "split street: a calendar link before the number is known",
  );
  await ask.getByRole("link", { name: "Podaj numer domu" }).click();
  await ask.waitForURL(`${server.origin}/adres/0972447-90004/smieci`);
  check(
    (await ask.locator('a[href^="/ics/"]').count()) === 0,
    "split street /smieci: a calendar link before the number is known",
  );
  await ask.getByLabel("Jaki jest numer domu?").fill("12");
  await ask.getByRole("button", { name: "Pokaż odbiory" }).click();
  await ask.waitForURL(`${server.origin}/adres/0972447-90004?nr=12`);
  check(
    (await ask.locator("main dt", { hasText: "Najbliższy odbiór" }).count()) ===
      1,
    "split street ?nr=12: no next pickup on the card",
  );
  await ask.goto(`${server.origin}/adres/0972447-90004/smieci?nr=12`);
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
    await ask.goto(`${server.origin}/adres/0972447-90004/smieci?nr=${nr}`);
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

  // Focus before the page is idle loads the index; idle later does not load
  // it again. Idle callbacks wait here until released by hand.
  const first = await browser.newPage();
  const firstIndex = countIndex(first);
  await first.addInitScript(() => {
    window.__idle = new Map();
    let next = 0;
    window.requestIdleCallback = (callback) => {
      next += 1;
      window.__idle.set(next, callback);
      return next;
    };
    window.cancelIdleCallback = (id) => window.__idle.delete(id);
  });
  await first.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  const beforeFocus = firstIndex.count;
  await Promise.all([
    first.waitForResponse(/\/api\/search-index\//, { timeout: 5000 }),
    first.locator("#adres").click(),
  ]).catch(() => {});
  await first.evaluate(() => {
    const callbacks = [...window.__idle.values()];
    window.__idle.clear();
    for (const callback of callbacks) {
      callback({ didTimeout: true, timeRemaining: () => 0 });
    }
  });
  await first.getByRole("combobox").pressSequentially("asnyka");
  await first
    .getByRole("option", { name: /Asnyka/ })
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  check(
    beforeFocus === 0 && firstIndex.count === 1,
    `focus before idle: ${beforeFocus} index requests before focus and ${firstIndex.count} in all, expected 0 and 1`,
  );
  await first.close();

  // Save-Data: no prefetch, the index loads on focus.
  const lite = await browser.newPage();
  const liteIndex = countIndex(lite);
  await lite.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
    });
  });
  await lite.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  // Past requestIdleCallback's 2000 ms timeout.
  await lite.waitForTimeout(3000);
  const liteBefore = liteIndex.count;
  await Promise.all([
    lite.waitForResponse(/\/api\/search-index\//, { timeout: 5000 }),
    lite.locator("#adres").click(),
  ]).catch(() => {});
  check(
    liteBefore === 0 && liteIndex.count === 1,
    `Save-Data: ${liteBefore} index requests before focus and ${liteIndex.count} after, expected 0 and 1`,
  );
  await lite.close();

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

  // Typing straight after load, before accessible-autocomplete has loaded
  // (it does once the page is idle), on Slow 4G + 4× CPU (as check-perf): no
  // page error, the field stays, nothing typed is lost and the results
  // appear. At 0 ms per key typing must end before the library mounts, so
  // that path is really covered.
  for (const delay of [0, 60, 150]) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const early = await context.newPage();
    const errors = [];
    early.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(early);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1475 * 1024) / 8,
      uploadThroughput: (675 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await early.goto(`${server.origin}/`, { waitUntil: "commit" });
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

finish(failures, "Search popup: no layout shift, combobox keyboard ok.");
