// iOS opens the keyboard only for focus given in the tap itself, never for
// focus moved to another field afterwards, so the field a user taps must
// already be accessible-autocomplete's own (task 95): its React build,
// rendered on the server and hydrated in place (task 227). In WebKit as an
// iPhone, on a cold load of / and of /szukaj: the field in the HTML is the
// library's combobox, one tap focuses that very field and no field is added
// or removed after it. After an empty search, the error summary's link
// moves focus to the field. Typing straight after load loses nothing. Run
// after `next build`; needs Playwright's WebKit.
import { devices, webkit } from "playwright";
import { finish, startServer } from "./lib/server.mjs";

const server = await startServer(3303);
const browser = await webkit.launch();
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const iphone = devices["iPhone 15"];
// The library's field (a combobox), from the first paint.
const combobox = (page) =>
  page.locator('#adres[role="combobox"]').waitFor({ timeout: 10000 });

// Counts every field added to or removed from the search from now on.
const watchFields = (page) =>
  page.evaluate(() => {
    window.__swaps = 0;
    const container = document
      .querySelector("#adres")
      .closest("div").parentElement;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (
            node.nodeType === 1 &&
            (node.matches("input") || node.querySelector("input"))
          ) {
            window.__swaps += 1;
          }
        }
      }
    }).observe(container, { childList: true, subtree: true });
  });

try {
  for (const path of ["/", "/szukaj?q=adama"]) {
    const context = await browser.newContext(iphone);
    const page = await context.newPage();
    await page.goto(`${server.origin}${path}`, { waitUntil: "networkidle" });
    await combobox(page);
    const field = await page.locator("#adres").elementHandle();
    await watchFields(page);
    await page.locator("#adres").tap();
    await page.waitForTimeout(500);
    const state = await page.evaluate(
      (el) => ({
        same: document.activeElement === el,
        connected: el.isConnected,
        swaps: window.__swaps,
        fields: document.querySelectorAll('input[name="q"]').length,
      }),
      field,
    );
    check(
      state.same && state.connected && state.swaps === 0 && state.fields === 1,
      `${path}: a tap does not focus the field it hit, or the field was swapped after it ${JSON.stringify(state)}`,
    );
    await context.close();
  }

  // An empty search: the error summary's link moves focus to the field.
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Szukaj" }).tap();
  await page.locator('.govuk-error-summary__list a[href="#adres"]').tap();
  await page.waitForTimeout(300);
  const linked = await page.evaluate(() => ({
    id: document.activeElement?.id,
    role: document.activeElement?.getAttribute("role"),
  }));
  check(
    linked.id === "adres" && linked.role === "combobox",
    `empty search: the error summary link does not focus the field ${JSON.stringify(linked)}`,
  );
  await context.close();

  // Typing at once after load, before hydration: nothing lost.
  for (const delay of [0, 30]) {
    const fast = await browser.newContext(iphone);
    const early = await fast.newPage();
    const errors = [];
    early.on("pageerror", (error) => errors.push(error.message));
    await early.goto(`${server.origin}/`, { waitUntil: "commit" });
    await early.locator("#adres").tap();
    await early.keyboard.type("asnyka", { delay });
    await combobox(early);
    await early.waitForTimeout(500);
    const state = {
      errors,
      fields: await early.locator('input[name="q"]').count(),
      value: await early.locator("#adres").inputValue(),
      focused: await early.evaluate(
        () => document.activeElement?.id === "adres",
      ),
    };
    check(
      state.errors.length === 0 &&
        state.fields === 1 &&
        state.value === "asnyka" &&
        state.focused,
      `early typing at ${delay} ms per key: ${JSON.stringify(state)}`,
    );
    await fast.close();
  }
} finally {
  await browser.close();
  server.stop();
}

finish(failures, "iOS focus: a tap focuses the final field, nothing lost.");
