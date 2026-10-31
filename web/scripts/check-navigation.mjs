// Checks that the site's own links navigate client-side (next/link, task
// 228): a walk through the site by its links (a home example, the hub's
// link to /smieci, the breadcrumbs back to the hub, the footer's /ulice, the
// header's logo home) is one document, never a full load: a marker set on
// `window` on the first load survives, and no request is a navigation.
// After every step: the page's visible h1, Next.js's route announcer says
// the new title, one visible <main id="main-content"> with no id twice,
// the breadcrumbs only on the address pages, right before <main>, focus
// never left on a hidden element, and every live block (IMGW, the hub's
// water and weather, „Najbliższe dni”) in, its skeleton gone. Going back
// to the hub by a link fetches its page again (no stale hole from the
// client cache), and the home page reached by the logo has an empty search
// field. Clicked from the footer, the new page starts at its top. Run after
// `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { finish, mainAndIds, startServer } from "./lib/server.mjs";

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
}

const HUB = "/adres/0972447-00470";

const server = await startServer(3313);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const documents = [];
  // Page requests (RSC) for each path, not prefetches.
  const fetched = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) documents.push(request.url());
    const headers = request.headers();
    if (
      headers.rsc === "1" &&
      !headers["next-router-prefetch"] &&
      !headers["next-router-segment-prefetch"]
    ) {
      fetched.push(new URL(request.url()).pathname);
    }
  });

  await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.__oneDocument = true;
  });
  documents.length = 0;

  // A search typed and left: the logo later brings an empty field.
  await page.getByRole("combobox").pressSequentially("asnyka");
  await page.getByRole("combobox").press("Escape");

  const visible = (selector) =>
    page.locator(selector).filter({ visible: true });

  // What the page shows once a client-side navigation to `path` is done.
  async function arrived(step, path, { crumbs }) {
    try {
      await page.waitForURL((url) => url.pathname === path, { timeout: 10000 });
      await page.getByRole("heading", { level: 1 }).waitFor();
      // Every live block in: no visible skeleton.
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll(".app-skeleton")].some((el) =>
            el.checkVisibility(),
          ),
        null,
        { timeout: 10000 },
      );
      // Next.js's route announcer (a polite region in its own shadow root)
      // says the new page's title.
      await page.waitForFunction(
        () =>
          document
            .querySelector("next-route-announcer")
            ?.shadowRoot?.textContent?.trim() === document.title,
        null,
        { timeout: 5000 },
      );
    } catch (error) {
      check(false, `${step}: did not arrive at ${path}: ${error}`);
      return;
    }
    const state = await page.evaluate(() => {
      const nav = [...document.querySelectorAll(".govuk-breadcrumbs")].filter(
        (el) => el.checkVisibility(),
      );
      const active = document.activeElement;
      return {
        marker: window.__oneDocument === true,
        crumbs: nav.length,
        beforeMain: nav.every(
          (el) => el.nextElementSibling?.id === "main-content",
        ),
        focus:
          active === document.body ||
          (active?.checkVisibility() ?? false) ||
          active?.tagName,
        scrollY: window.scrollY,
      };
    });
    const ids = await mainAndIds(page);
    check(
      state.marker && documents.length === 0,
      `${step}: a full document load (marker ${state.marker}, documents ${JSON.stringify(documents)})`,
    );
    check(
      ids.mains === 1 && ids.main && ids.duplicates.length === 0,
      `${step}: main and ids ${JSON.stringify(ids)}`,
    );
    check(
      state.crumbs === crumbs && state.beforeMain,
      `${step}: ${state.crumbs} visible breadcrumbs (want ${crumbs}), right before <main>: ${state.beforeMain}`,
    );
    check(
      state.focus === true,
      `${step}: focus left on a hidden ${state.focus}`,
    );
    return state;
  }

  // The hub's water and weather sections: a body under the heading.
  async function hubSections(step) {
    for (const id of ["pogoda", "woda"]) {
      const text = await visible(`section#${id}`).innerText();
      check(
        text.split("\n").filter((line) => line.trim()).length > 1,
        `${step}: the ${id} section has no body: ${JSON.stringify(text)}`,
      );
    }
  }

  // A flat page's IMGW line, its live block.
  async function imgwLine(step) {
    check(
      await page
        .getByRole("link", { name: "Ostrzeżenia IMGW" })
        .isVisible()
        .catch(() => false),
      `${step}: the IMGW line is not there after the navigation`,
    );
  }

  // A home example: an address page, the hub.
  await visible('section[aria-labelledby="sample-heading"] ul a')
    .first()
    .click();
  await page.waitForURL((url) => url.pathname.startsWith("/adres/"));
  const examplePath = new URL(page.url()).pathname;
  await arrived("home → example", examplePath, { crumbs: 1 });

  // The hub of the CI fixture's street: its waste and weather sections in.
  await page.goto(`${server.origin}${HUB}`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.__oneDocument = true;
  });
  documents.length = 0;
  await hubSections("hub");

  await page.getByRole("link", { name: "Wszystkie odbiory śmieci" }).click();
  await arrived("hub → /smieci", `${HUB}/smieci`, { crumbs: 1 });

  // Back to the hub by its breadcrumb: its page is fetched again.
  fetched.length = 0;
  await visible(".govuk-breadcrumbs a").last().click();
  await arrived("/smieci → hub (breadcrumb)", HUB, { crumbs: 1 });
  check(
    fetched.includes(HUB),
    `/smieci → hub: the hub's page was not fetched again (${JSON.stringify(fetched)})`,
  );
  await hubSections("hub again");

  // The footer's list of every place, clicked at the bottom of the page.
  const footerLink = page
    .locator("footer")
    .getByRole("link", { name: "Wszystkie ulice i wsie" });
  await footerLink.scrollIntoViewIfNeeded();
  await footerLink.click();
  const ulice = await arrived("hub → /ulice (footer)", "/ulice", {
    crumbs: 0,
  });
  check(
    ulice?.scrollY === 0,
    `hub → /ulice (footer): the page starts ${ulice?.scrollY}px down`,
  );
  await imgwLine("/ulice");

  // The header's logo: home, the search field empty, its list closed.
  await page
    .getByRole("link", { name: "conaulicy.pl – strona główna" })
    .click();
  await arrived("/ulice → home (logo)", "/", { crumbs: 0 });
  const field = page.getByRole("combobox");
  check(
    (await field.inputValue()) === "" &&
      (await field.getAttribute("aria-expanded")) === "false",
    `home by the logo: the field holds "${await field.inputValue()}"`,
  );
  await imgwLine("home");
} catch (error) {
  check(false, `navigation walk: ${error}`);
} finally {
  await browser.close();
  await server.stop();
}

finish(
  failures,
  "Navigation: the site's links are client-side (one document), live blocks in, the announcer, focus and breadcrumbs right.",
);
