// Checks the address search on the home page, its one place (task 227:
// /szukaj is gone): alphagov accessible-autocomplete's React build, the
// field from the first paint, at 360px and 1280px. The suggestion list
// opens inline, under the field and above „Szukaj” (GOV.UK's default), so
// it pushes the content below down while open but never covers the button,
// and every layout shift is right after input (none that CLS would count);
// once closed (Escape, a click outside) the content is back where it was. It
// follows the APG combobox keyboard model (nothing highlighted until
// ArrowDown, which goes to the first option), and its rows use the field's
// font family and size.
// Matching runs on the device: the index loads once, when the page is idle
// after load or on focus if that comes first (only on focus with
// Save-Data), and typing makes no request. Also: "ul" alone asks for a
// name, "Zmień adres" on a street page lands on an empty field with the list
// closed, /api/search answers when the index cannot load, and a house
// number ("kosciuszki 7a") reaches the street page, which picks the part of
// a split street by it, or asks for it (also without JS). Picking a
// suggestion (a tap, or ArrowDown and Enter) only fills the field and closes
// the list, as GOV.UK's default; „Szukaj” or the next Enter submits, which
// opens the picked place, also with a house number typed after it. Enter
// with no option highlighted (list open or closed, none found) submits what
// was typed. „Szukaj”, decided on the device: one place opens its page by
// client-side navigation (never a document load); several are listed under
// the field, none says what to try (plain text, never an error), both with
// no navigation, announced by a polite live region; while the index is not
// in, a skeleton of one result holds their place. Back and Forward go where
// they should. The hint's example ("Asnyka 5") opens its street with a
// number the register has. „Szukaj”, /api/search and lib/search.ts rank
// alike. An empty search shows GOV.UK's error, and only then. Run after
// `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { matcher, placeHref } from "../lib/search.ts";
import { finish, startServer } from "./lib/server.mjs";

const WIDTHS = [360, 1280];
// A live block's reveal may move the page a little (Jakub's decision,
// 31 Oct 2026: shifts on reveal accepted, no CLS-0 gate): at most web.dev's
// "good" CLS (web.dev/articles/cls).
const REVEAL_SHIFT = 0.1;
// Clicks the field (the library's, empty).
async function openField(page) {
  await page.locator("#adres").click();
  const input = page.getByRole("combobox");
  await input.waitFor();
  return input;
}

// The links to places that „Szukaj” lists under the field.
const resultLinks = (page) =>
  page.locator('#szukaj [aria-live="polite"] ul.govuk-list a');

// „Szukaj” is not under the list: their boxes do not meet, and the button
// is on top at its centre.
function buttonClear(page) {
  return page.evaluate(() => {
    const button = document.querySelector("search button");
    // Below the open list it may be past the fold: scroll to it, as a user
    // would (a scroll is no layout shift).
    button.scrollIntoView({ block: "nearest" });
    const b = button.getBoundingClientRect();
    const l = document.querySelector("#adres__listbox").getBoundingClientRect();
    const top = document.elementFromPoint(
      b.left + b.width / 2,
      b.top + b.height / 2,
    );
    return {
      apart:
        l.bottom <= b.top ||
        b.bottom <= l.top ||
        l.right <= b.left ||
        b.right <= l.left,
      onTop: button.contains(top),
    };
  });
}

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
  const path = "/";
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
    await page.goto(`${server.origin}${path}`, { waitUntil: "load" });
    await Promise.race([
      indexRequested,
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
    check(
      requests.index === 1,
      `${path} ${width}px: the index was not requested without focus once idle`,
    );
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState === "finished"),
    );

    // Layout shifts: those right after input (the inline list opening,
    // changing or closing; CLS forgives them) and those without (none).
    await page.evaluate(() => {
      window.__shift = { input: 0, other: 0, entries: [] };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) window.__shift.input += entry.value;
          else {
            window.__shift.other += 1;
            window.__shift.entries.push(entry.value);
          }
        }
      }).observe({ type: "layout-shift" });
    });

    // Page positions (not viewport: focusing may scroll) of what follows the
    // search: the rest of its column, and the footer.
    const below = () =>
      page.evaluate(() => {
        const after = [];
        let el = document.getElementById("szukaj").parentElement;
        for (;;) {
          el = el.nextElementSibling;
          if (!el) break;
          after.push(el);
        }
        return [...after, document.querySelector("footer")].map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()} ${Math.round(r.left)},${Math.round(r.top + window.scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        });
      });
    const before = await below();
    const label = `${path} ${width}px`;
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
    const clear = async (state) => {
      const button = await buttonClear(page);
      check(
        button.apart && button.onTop,
        `${label} ${state}: „Szukaj” under the list ${JSON.stringify(button)}`,
      );
    };
    const input = await openField(page);
    const listbox = page.getByRole("listbox");

    await input.pressSequentially("a");
    await note("Szukam…").waitFor();
    await sameType(note("Szukam…"), "loading");
    release();

    await result().first().waitFor();
    await clear("results");
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
    await clear("no results");
    await sameType(note("Brak wyników"), "no results");
    await input.fill("a");
    await result().first().waitFor();

    // Nothing highlighted until ArrowDown, which goes to the first option;
    // the highlight is the option aria-activedescendant names, and only it.
    const highlight = () =>
      page.evaluate(() => {
        const active = document
          .querySelector("#adres")
          .getAttribute("aria-activedescendant");
        return {
          active,
          selected: active
            ? document.getElementById(active)?.getAttribute("aria-selected")
            : null,
          focused: [
            ...document.querySelectorAll(".autocomplete__option--focused"),
          ].map((el) => el.id),
        };
      });
    const unpicked = await highlight();
    check(
      unpicked.active === null && unpicked.focused.length === 0,
      `${label}: an option highlighted before ArrowDown ${JSON.stringify(unpicked)}`,
    );
    await input.press("ArrowDown");
    const picked = await highlight();
    check(
      picked.active === "adres__option--0" &&
        picked.selected === "true" &&
        JSON.stringify(picked.focused) === '["adres__option--0"]',
      `${label}: ArrowDown does not highlight the first option ${JSON.stringify(picked)}`,
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
    await input.click();

    await input.fill("asnyka");
    await result().first().waitFor();
    await page.locator("h1").click();
    check(
      !(await listbox.isVisible()),
      `${label}: click outside does not close the popup`,
    );
    await same("closed by a click outside");

    await input.click();
    await result().first().waitFor();

    await input.fill("ul.");
    await note("Wpisz nazwę ulicy").waitFor();
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
    // Without input: only a live block's reveal, within
    // REVEAL_SHIFT.
    const other = shift.entries.reduce((sum, value) => sum + value, 0);
    check(
      other <= REVEAL_SHIFT,
      `${label}: ${shift.other} layout shifts without recent input ${JSON.stringify(shift.entries)}`,
    );
    console.log(
      `${label}: layout shift ${shift.input} after input, ${shift.other} without`,
    );
    await page.close();
  }

  // Enter with the list open and nothing highlighted submits what was
  // typed (ul. and os. Mickiewicza: both listed under the field): no
  // navigation, the list closed, the results at once (the index is in
  // memory), no skeleton, the field keeping the text, nothing in error.
  {
    const page = await browser.newPage({
      viewport: { width: 360, height: 800 },
    });
    const documents = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest()) documents.push(r.url());
    });
    await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    const input = await openField(page);
    await input.pressSequentially("Mickiewicza");
    await page
      .locator('[role="option"]:not([aria-disabled])')
      .first()
      .waitFor();
    const open = await input.getAttribute("aria-expanded");
    documents.length = 0;
    await input.press("Enter");
    await resultLinks(page)
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    const landed = await page.evaluate(() => {
      const live = document.querySelector('#szukaj [aria-live="polite"]');
      return {
        url: location.pathname + location.search,
        skeletons: live?.querySelectorAll(".app-skeleton").length,
        heading: live?.querySelector("h2")?.textContent,
        results: live?.querySelectorAll("ul.govuk-list a[href^='/adres/']")
          .length,
        field: document.querySelector("#adres")?.value,
        expanded: document
          .querySelector("#adres")
          ?.getAttribute("aria-expanded"),
        errors: document.querySelectorAll(
          ".govuk-error-summary, .govuk-error-message, .govuk-input--error",
        ).length,
      };
    });
    check(
      open === "true" &&
        landed.url === "/" &&
        documents.length === 0 &&
        landed.skeletons === 0 &&
        landed.heading === "Wyniki wyszukiwania" &&
        landed.results === 2 &&
        landed.field === "Mickiewicza" &&
        landed.expanded === "false" &&
        landed.errors === 0,
      `Enter with the list open (aria-expanded ${open}): ${JSON.stringify({ ...landed, documents })}`,
    );
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
  check(
    state.shift <= REVEAL_SHIFT,
    `Zmień adres: layout shift ${state.shift}`,
  );

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
  // next Enter submits the form. Keys go where focus is (ArrowDown moves it
  // to the option): a locator's press would focus the field first, which
  // clears the library's highlight.
  await house.keyboard.press("ArrowDown");
  await house.keyboard.press("Enter");
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
  // A client-side navigation: Next.js keeps the home page in the document,
  // hidden (Activity), so the visible h1 only, by role
  // (nextjs.org/docs/app/guides/preserving-ui-state, "Use visibility-aware
  // selectors").
  const heading = await house.getByRole("heading", { level: 1 }).textContent();
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
  // The list is open again, inline above „Szukaj”: a click on it must not
  // be lost to the list closing under the pointer.
  check(
    (await field.getAttribute("aria-expanded")) === "true",
    "number typed after a pick: the list is not open over the button",
  );
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

  // Enter with no suggestion (none found) submits: "not found" under the
  // field, as plain text (no error: GOV.UK's error message is for
  // validation only), with what to try; the field stays valid.
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
    .locator('#szukaj [aria-live="polite"] h2', {
      hasText: "Nie znaleźliśmy „xyzqq”",
    })
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  const none = await enter.evaluate(() => {
    const live = document.querySelector('#szukaj [aria-live="polite"]');
    return {
      url: location.pathname + location.search,
      heading: live?.querySelector("h2")?.textContent,
      tips: live?.querySelectorAll("ul.govuk-list--bullet li").length,
      errors: document.querySelectorAll(
        ".govuk-error-summary, .govuk-error-message, .govuk-input--error, .govuk-form-group--error",
      ).length,
    };
  });
  check(
    none.url === "/" &&
      none.heading === "Nie znaleźliśmy „xyzqq”" &&
      none.tips === 3 &&
      none.errors === 0,
    `Enter with no results: ${JSON.stringify(none)}`,
  );
  await enter.close();

  // An empty search: no error until one is submitted; then GOV.UK's, with
  // no navigation: the error summary (focused, so it is announced) linking
  // to the field, the error message, the error styles, the error read
  // first. A search with text then clears it.
  for (const path of ["/"]) {
    const empty = await browser.newPage({
      viewport: { width: 360, height: 800 },
    });
    await empty.goto(`${server.origin}${path}`, { waitUntil: "networkidle" });
    const before = await empty
      .locator(".govuk-error-summary, .govuk-error-message")
      .count();
    await empty.getByRole("button", { name: "Szukaj" }).click();
    await empty
      .waitForFunction(
        () => document.activeElement?.classList.contains("govuk-error-summary"),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    const shown = await empty.evaluate(() => {
      const field = document.querySelector("#adres");
      return {
        url: location.pathname + location.search,
        focused: document.activeElement?.classList.contains(
          "govuk-error-summary",
        ),
        link: document
          .querySelector(".govuk-error-summary__list a")
          ?.getAttribute("href"),
        message: document.querySelector("#adres-error")?.textContent,
        input: field.classList.contains("govuk-input--error"),
        group: Boolean(field.closest(".govuk-form-group--error")),
        hint: document
          .getElementById(field.getAttribute("aria-describedby") ?? "")
          ?.textContent?.startsWith("Błąd: Wpisz nazwę ulicy albo wsi."),
      };
    });
    const at = new URL(path, server.origin);
    check(
      before === 0 &&
        shown.url === at.pathname + at.search &&
        shown.focused &&
        shown.link === "#adres" &&
        shown.message === "Błąd: Wpisz nazwę ulicy albo wsi" &&
        shown.input &&
        shown.group &&
        shown.hint,
      `${path}: empty search ${JSON.stringify({ before, ...shown })}`,
    );
    await empty.locator(".govuk-error-summary__list a").click();
    check(
      (await empty.evaluate(() => document.activeElement?.id)) === "adres",
      `${path}: the error summary's link does not focus the field`,
    );
    await empty.getByRole("combobox").pressSequentially("adama");
    await empty.getByRole("button", { name: "Szukaj" }).click();
    await resultLinks(empty)
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    check(
      (await empty
        .locator(
          ".govuk-error-summary, .govuk-error-message, .govuk-input--error",
        )
        .count()) === 0,
      `${path}: the error stays after a search with text`,
    );
    await empty.close();
  }

  // The same search everywhere: for each query, where „Szukaj” lands (one
  // place: its page; else the first result under the field), /api/search's
  // first place and lib/search.ts's over the served index all point at the
  // same place and number.
  const lands = await browser.newPage();
  const home = await (await fetch(`${server.origin}/`)).text();
  const [indexPath] = home.match(/\/api\/search-index\/[0-9a-f]{16}/) ?? [];
  const index = await (await fetch(`${server.origin}${indexPath}`)).json();
  const match = matcher(index);
  for (const query of [
    "rynek",
    "Rynk",
    "adama",
    "Asnyka 12",
    "Asnyka 5",
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
    await lands.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await lands.getByRole("combobox").fill(query);
    await lands.getByRole("button", { name: "Szukaj" }).click();
    // The place's page, or what is under the field, once the index is in.
    await Promise.race([
      lands.waitForURL((url) => url.pathname !== "/"),
      lands
        .locator('#szukaj [aria-live="polite"] h2', {
          hasText: /Wyniki wyszukiwania|Nie znaleźliśmy/,
        })
        .waitFor(),
    ]).catch(() => {});
    const at = new URL(lands.url());
    const target =
      at.pathname === "/"
        ? await resultLinks(lands)
            .first()
            .getAttribute("href", { timeout: 1000 })
            .catch(() => null)
        : decodeURI(`${at.pathname}${at.search}`);
    const hrefs = [shared, api].map((hit) => (hit ? placeHref(hit) : null));
    check(
      hrefs[0] === hrefs[1] && hrefs[0] === target,
      `same search "${query}": module ${hrefs[0]}, /api/search ${hrefs[1]}, „Szukaj” ${target}`,
    );
  }
  await lands.close();

  // A split street without a number asks for it, with no JS at all.
  const plain = await browser.newContext({ javaScriptEnabled: false });
  // „Szukaj” (typed, no pick): one place opens its page by client-side
  // navigation, never a document request; several are listed under the
  // field at once, no skeleton, no navigation.
  for (const [query, url] of [
    ["rynek", "/adres/0972447-19253"],
    ["Asnyka 12", "/adres/0972447-00470?nr=12"],
    // The hint's example: a number the address register has.
    ["Asnyka 5", "/adres/0972447-00470?nr=5"],
    ["adama", "/"],
  ]) {
    const form = await browser.newPage();
    const documents = [];
    form.on("request", (r) => {
      if (r.isNavigationRequest()) documents.push(r.url());
    });
    await form.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await form.locator("#adres").click();
    await form.getByRole("combobox").pressSequentially(query);
    documents.length = 0;
    await form.getByRole("button", { name: "Szukaj" }).click();
    if (url === "/") {
      await resultLinks(form)
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => {});
    } else {
      await form
        .waitForURL(`${server.origin}${url}`, { timeout: 5000 })
        .catch(() => {});
    }
    const at = new URL(form.url());
    const state = {
      at: decodeURI(`${at.pathname}${at.search}`),
      documents,
      results: await resultLinks(form).count(),
      skeletons: await form.locator("#szukaj .app-skeleton").count(),
    };
    check(
      state.at === url &&
        documents.length === 0 &&
        (url !== "/" || (state.results === 2 && state.skeletons === 0)),
      `„Szukaj” "${query}": ${JSON.stringify(state)}, want ${url}`,
    );
    if (query === "Asnyka 5") {
      check(
        !(await form.content()).includes("Nie znaleźliśmy nr"),
        "hint example Asnyka 5: the register lacks the number",
      );
    }
    await form.close();
  }

  // The index not in yet when „Szukaj” is pressed: a skeleton of one result
  // under the field (with „Sprawdzamy…” for screen readers), then the list.
  {
    const slow = await browser.newPage({
      viewport: { width: 360, height: 800 },
    });
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await slow.route("**/api/search-index/**", async (route) => {
      await held;
      await route.continue();
    });
    await slow.goto(`${server.origin}/`, { waitUntil: "load" });
    await slow.getByRole("combobox").fill("adama");
    await slow.getByRole("button", { name: "Szukaj" }).click();
    const waiting = await slow
      .locator('#szukaj [aria-live="polite"] .app-skeleton')
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const loading = await slow
      .locator('#szukaj [aria-live="polite"] .govuk-visually-hidden', {
        hasText: "Sprawdzamy…",
      })
      .count();
    release();
    await resultLinks(slow)
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    check(
      waiting &&
        loading === 1 &&
        (await resultLinks(slow).count()) === 2 &&
        (await slow.locator("#szukaj .app-skeleton").count()) === 0,
      `„Szukaj” before the index: skeleton ${waiting}, „Sprawdzamy…” ${loading}, then ${await resultLinks(slow).count()} results`,
    );
    await slow.close();
  }

  // Back and Forward: home, a place, back home, forward to the place.
  const nav = await browser.newPage();
  const steps = [];
  try {
    await nav.goto(`${server.origin}/`, { waitUntil: "networkidle" });
    await nav.getByRole("combobox").fill("rynek");
    await nav.getByRole("button", { name: "Szukaj" }).click();
    await nav.waitForURL(`${server.origin}/adres/0972447-19253`);
    steps.push("to the place");
    await nav.goBack();
    await nav.waitForURL(`${server.origin}/`);
    await nav.getByRole("combobox").waitFor();
    steps.push("back home");
    await nav.goForward();
    await nav.waitForURL(`${server.origin}/adres/0972447-19253`);
    steps.push("forward to the place");
  } catch (error) {
    check(false, `Back/Forward: after ${JSON.stringify(steps)}: ${error}`);
  }
  await nav.close();

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
    (await ask.locator("main p", { hasText: /^Tego dnia odbiorą/ }).count()) ===
      1,
    "split street ?nr=12: no next pickup in the waste section",
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
    "Numeru 42 nie ma w harmonogramie tej ulicy. Sprawdź numer albo harmonogram Urzędu Miejskiego";
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

  // A page with a number is served as the plain one, from a prerendered
  // shell with its live blocks streamed in (x-nextjs-postponed), also on a
  // split street after its error pages were served: the error has its own
  // path (/numer, or the unknown number's own), never a valid one's.
  for (const query of ["", "abc", "42"]) {
    await fetch(`${server.origin}/adres/0972447-90004?nr=${query}`);
  }
  for (const page of ["0972447-00470?nr=12", "0972447-90004?nr=12"]) {
    const url = `${server.origin}/adres/${page}`;
    await fetch(url);
    const res = await fetch(url);
    const shell = res.headers.get("x-nextjs-postponed");
    const html = await res.text();
    check(
      shell === "1" && !html.includes("govuk-error-summary"),
      `${page}: not a shell or shows an error (x-nextjs-postponed: ${shell})`,
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

  // Typing straight after load, before the page has hydrated, on Slow 4G +
  // 4× CPU (as check-perf): the field is the library's from the first paint
  // (server-rendered, hydrated in place), no page error, the field stays,
  // nothing typed is lost and the results appear.
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
      .evaluate((el) => el.getAttribute("role"), null, { timeout: 2000 })
      .catch(() => "missing");
    check(
      mounted === "combobox",
      `early typing at ${delay} ms per key: the field was ${mounted} when typing ended`,
    );
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

finish(
  failures,
  "Search list: inline, never over „Szukaj”, no shift without input, combobox keyboard ok.",
);
