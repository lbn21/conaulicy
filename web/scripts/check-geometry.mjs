// Checks the header's and the warning icon's pixel geometry numerically, so
// the pixel-perfect work of tasks 78-84 cannot regress unnoticed: on the home
// page and a street page, at 375px and 1280px, the bar's height, colour and the
// plate's gaps, the hover and focus bars' place, the focus box's frame, and
// the warning icon's "!" in its circle (ink, measured as in task 83). Boxes
// come from getBoundingClientRect and computed styles, and must be exact;
// ink is in 0.25px device pixels (DPR 4), within INK_TOLERANCE. Run after
// `next build`; needs Playwright's Chromium.
import { chromium } from "playwright";
import { HEADER } from "../lib/palette.ts";
import { finish, startServer } from "./lib/server.mjs";

const WIDTHS = [375, 1280];
const PATHS = ["/", "/adres/0972447-00470"];
const DPR = 4;

// The Generic header's bar, 1px taller than GOV.UK's 61px (tasks 78 and 82).
const HEADER_HEIGHT = 62;
// The plate's gap to the bar's top and bottom, centred (tasks 78 and 82).
const PLATE_GAP = 16;
// The hover bar, 4px instead of GOV.UK's 3px, 6px below the plate and 6px
// above the bar's bottom (task 82, Jakub's decision).
const HOVER_BAR = { top: 52, bottom: 56 };
// The header bar's colour (HEADER in lib/palette.ts, task 88), as Chrome
// computes it.
const HEADER_COLOUR = `rgb(${[1, 3, 5].map((i) => Number.parseInt(HEADER.slice(i, i + 2), 16)).join(", ")})`;
// GOV.UK's 4px focus bar, at the hover bar's place (task 82), in the header's
// colour so it does not show (task 88).
const FOCUS_BAR = HOVER_BAR;
// The yellow focus box's frame round the plate's box, on all sides (task 82).
const FOCUS_FRAME = 6;
// The "!"'s ink gaps to the circle, with line-height 28px: Chrome moves text
// in whole px, so about 0.7px high is the closest to centred it allows (task 83).
// As measured on the CI runner (macOS reads 6.94 / 7.63).
const BANG_GAPS = { top: 6.98, bottom: 7.74 };
// Ink is measured, not computed (the brief's ±0.5px).
const INK_TOLERANCE = 0.5;

const server = await startServer(3303);
const browser = await chromium.launch();
const failures = [];
const exact = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: ${actual}, expected ${expected}`);
  }
};
const near = (label, actual, expected) => {
  if (!(Math.abs(actual - expected) <= INK_TOLERANCE)) {
    failures.push(
      `${label}: ${actual.toFixed(2)}, expected ${expected} ±${INK_TOLERANCE}`,
    );
  }
};

// The boxes and styles the header checks need, in CSS px from the page top.
const measureHeader = (page) =>
  page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return {
        top: r.top + scrollY,
        bottom: r.bottom + scrollY,
        left: r.left,
        right: r.right,
      };
    };
    const link = document.querySelector(".govuk-generic-header__homepage-link");
    const style = getComputedStyle(link);
    // "rgb(255, 221, 0) 0px -2px 0px 0px, <HEADER_COLOUR> 0px 4px 0px 0px"
    const shadows = style.boxShadow
      .split(/,(?![^(]*\))/)
      .filter((s) => s.trim() !== "none")
      .map((s) => {
        const color = s.match(/rgba?\([^)]*\)/)[0];
        const [, y] = s.replace(color, "").trim().split(/\s+/).map(parseFloat);
        return { color, y };
      });
    return {
      header: box(".govuk-generic-header"),
      plate: box(".app-logo"),
      link: box(".govuk-generic-header__homepage-link"),
      borderBottom: parseFloat(style.borderBottomWidth),
      background: style.backgroundColor,
      headerBackground: getComputedStyle(
        document.querySelector(".govuk-generic-header"),
      ).backgroundColor,
      shadows,
      active: document.activeElement === link,
    };
  });

// The "!"'s ink gaps to its circle, in CSS px: a DPR 4 screenshot of the icon,
// decoded in the page. Down the stroke's middle (the lightest of 5 columns
// round the circle's centre), the darkness of each device pixel is summed from
// the edge of the shot to the glyph's first light pixel: the white outside
// adds nothing, the circle 1 a pixel, and the anti-aliased edges their share.
const measureBang = async (page) => {
  const icon = page.locator(".govuk-warning-text__icon");
  await icon.scrollIntoViewIfNeeded();
  const r = await icon.evaluate((el) => el.getBoundingClientRect().toJSON());
  const margin = 2;
  const png = await page.screenshot({
    clip: {
      x: r.x - margin,
      y: r.y - margin,
      width: r.width + 2 * margin,
      height: r.height + 2 * margin,
    },
  });
  const gaps = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(
      0,
      0,
      image.width,
      image.height,
    );
    // 0 on white, 1 on the circle's black (#0b0c0c), by the green channel.
    const dark = (x, y) =>
      Math.min(1, Math.max(0, (255 - data[(y * width + x) * 4 + 1]) / 243));
    const middle = height >> 1;
    let left = 0;
    let right = width - 1;
    while (dark(left, middle) < 0.5) left++;
    while (dark(right, middle) < 0.5) right--;
    const centre = (left + right) >> 1;
    const stroke = (y) =>
      Math.min(...[-2, -1, 0, 1, 2].map((dx) => dark(centre + dx, y)));
    const gap = (rows) => {
      let sum = 0;
      let inCircle = false;
      for (const y of rows) {
        const d = stroke(y);
        if (inCircle && d < 0.5) return sum + d;
        if (d >= 0.5) inCircle = true;
        sum += d;
      }
      return Number.NaN;
    };
    const rows = [...Array(height).keys()];
    return { top: gap(rows), bottom: gap(rows.reverse()) };
  }, png.toString("base64"));
  return { top: gaps.top / DPR, bottom: gaps.bottom / DPR };
};

try {
  for (const width of WIDTHS) {
    for (const path of PATHS) {
      const label = `${path} [${width}px]`;
      const failed = failures.length;
      const page = await browser.newPage({
        viewport: { width, height: 800 },
        deviceScaleFactor: DPR,
        reducedMotion: "reduce",
      });
      await page.goto(server.origin + path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const normal = await measureHeader(page);
      exact(`${label} header colour`, normal.headerBackground, HEADER_COLOUR);
      exact(
        `${label} header height`,
        normal.header.bottom - normal.header.top,
        HEADER_HEIGHT,
      );
      exact(
        `${label} plate gap above`,
        normal.plate.top - normal.header.top,
        PLATE_GAP,
      );
      exact(
        `${label} plate gap below`,
        normal.header.bottom - normal.plate.bottom,
        PLATE_GAP,
      );

      await page.hover(".govuk-generic-header__homepage-link");
      const hover = await measureHeader(page);
      exact(
        `${label} hover bar thickness`,
        hover.borderBottom,
        HOVER_BAR.bottom - HOVER_BAR.top,
      );
      exact(
        `${label} hover bar top`,
        hover.link.bottom - hover.borderBottom,
        HOVER_BAR.top,
      );
      exact(`${label} hover bar bottom`, hover.link.bottom, HOVER_BAR.bottom);
      exact(`${label} plate top on hover`, hover.plate.top, normal.plate.top);
      await page.mouse.move(0, 700);

      // Keyboard focus: the skip link first, then the homepage link.
      for (let i = 0; i < 3 && !(await measureHeader(page)).active; i++) {
        await page.keyboard.press("Tab");
      }
      const focus = await measureHeader(page);
      exact(`${label} homepage link focused by Tab`, focus.active, true);
      const yellow = focus.shadows.find((s) => s.color === focus.background);
      const bar = focus.shadows.find((s) => s.color !== focus.background);
      exact(`${label} focus bar colour`, bar?.color, HEADER_COLOUR);
      exact(
        `${label} focus bar thickness`,
        bar?.y,
        FOCUS_BAR.bottom - FOCUS_BAR.top,
      );
      exact(`${label} focus bar top`, focus.link.bottom, FOCUS_BAR.top);
      exact(
        `${label} focus bar bottom`,
        focus.link.bottom + (bar?.y ?? 0),
        FOCUS_BAR.bottom,
      );
      const yellowTop = focus.link.top + Math.min(0, yellow?.y ?? 0);
      exact(
        `${label} focus frame above`,
        focus.plate.top - yellowTop,
        FOCUS_FRAME,
      );
      exact(
        `${label} focus frame below`,
        focus.link.bottom - focus.plate.bottom,
        FOCUS_FRAME,
      );
      exact(
        `${label} focus frame left`,
        focus.plate.left - focus.link.left,
        FOCUS_FRAME,
      );
      exact(
        `${label} focus frame right`,
        focus.link.right - focus.plate.right,
        FOCUS_FRAME,
      );
      exact(`${label} plate top on focus`, focus.plate.top, normal.plate.top);

      if (path !== "/") {
        const bang = await measureBang(page);
        near(`${label} "!" gap above`, bang.top, BANG_GAPS.top);
        near(`${label} "!" gap below`, bang.bottom, BANG_GAPS.bottom);
        console.log(
          `      ${label} "!" ${bang.top.toFixed(2)} above, ${bang.bottom.toFixed(2)} below`,
        );
      }
      if (failures.length === failed) console.log(`ok    ${label}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

finish(
  failures,
  `Header and warning icon geometry as decided on ${WIDTHS.length * PATHS.length} pages.`,
);
