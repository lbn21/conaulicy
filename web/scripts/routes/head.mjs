// The address pages' heads (components/page-head.tsx, docs/layout.md Page
// head), one spacing scale (t373): on the first place of each type in the
// CI fixture's search index (a street, a village, a village part), at 390
// and 1280 px, the band's
// gaps (top padding, the street line to the h1, the h1 to its next line,
// the last line to the bottom) and its distance from the breadcrumbs are
// the same on /smieci, /woda and /prad, within 0.5 px; the address page's
// head, its own (no street line), has the same top, h1-to-next and bottom
// gaps; the street line sits apart from the h1 (more than GOV.UK's caption
// margin alone, 5/0 px). Only the h1's height may differ (a title that
// wraps).

import { searchIndexOf } from "../lib/server.mjs";

const WIDTHS = [390, 1280];
const TOLERANCE = 0.5;
const PAGES = ["", "/smieci", "/woda", "/prad"];

/** The band's gaps, in px, in order. */
const gaps = (page) =>
  page.evaluate(() => {
    const band = document.querySelector("main .app-band");
    const crumbs = document.querySelector(".govuk-breadcrumbs");
    const b = band.getBoundingClientRect();
    const kids = [...band.children].map((el) => el.getBoundingClientRect());
    const h1 = [...band.children].findIndex((el) => el.tagName === "H1");
    const out = {
      crumbs: b.top - crumbs.getBoundingClientRect().bottom,
      top: kids[0].top - b.top,
      afterH1: kids[h1 + 1].top - kids[h1].bottom,
      bottom: b.bottom - kids.at(-1).bottom,
    };
    if (h1 > 0) out.caption = kids[h1].top - kids[h1 - 1].bottom;
    return out;
  });

export async function check({ origin }, failures) {
  const home = await (await fetch(`${origin}/`)).text();
  const { places } = await searchIndexOf(origin, home);
  const firsts = new Map();
  for (const [id, , type] of places)
    if (!firsts.has(type)) firsts.set(type, id);
  if (firsts.size === 0) failures.push("/: no search index");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const seen = [];
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      for (const id of firsts.values()) {
        const all = {};
        for (const sub of PAGES) {
          await page.goto(`${origin}/adres/${id}${sub}`, {
            waitUntil: "networkidle",
          });
          await page.waitForFunction(
            () => !document.querySelector(".app-skeleton"),
          );
          all[sub || "/"] = await gaps(page);
        }
        const at = `/adres/${id} at ${width}`;
        const ref = all["/smieci"];
        for (const [sub, g] of Object.entries(all))
          for (const [key, value] of Object.entries(g))
            if (key in ref && Math.abs(value - ref[key]) > TOLERANCE)
              failures.push(
                `${at}: ${sub}'s ${key} gap ${value.toFixed(2)} px, /smieci's ${ref[key].toFixed(2)}`,
              );
        if (!(ref.caption > (width < 641 ? 5 : 0) + TOLERANCE))
          failures.push(
            `${at}: the street line ${ref.caption.toFixed(2)} px above the h1, GOV.UK's caption margin alone`,
          );
        seen.push(
          `${id}@${width} ${["top", "caption", "afterH1", "bottom"].map((k) => `${k} ${ref[k].toFixed(1)}`).join(" ")}`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return `Heads: one scale on every address page; ${seen.join("; ")}.`;
}
