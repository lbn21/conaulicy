# Task 82: the logo's hover and focus bars, centred under the plate

Draft PR, one branch (`ui/82-logo-hover`): `web/app/site.scss`, `web/scripts/check-own-css.mjs`, `docs/logo/README.md` (one sentence) and this brief, plus crops in `docs/tasks/task-82/`. No drive-by changes, no database, no `next build/start/dev` locally.

## Goal

In the black Generic header (62 px), the white plate is 30 px tall, with 16 px above it and 16 px below it. On hover the homepage link draws a white bar under the plate, and on focus GOV.UK draws a black bar under the yellow box.

- **Hover:** the white bar is centred in the 16 px gap between the plate's bottom and the header's bottom, with equal space above and below (±0.25 px).
- **Jakub's addition:** the black focus bar sits exactly where the hover bar sits: the same top and bottom y, and the same thickness if GOV.UK allows. If the two bars differ in thickness, report it and centre each one in the 16 px gap.
- The yellow focus box shrinks from 7 px to match. It stays even on all four sides and centred on the plate, which is the logo's optical frame (the wordmark's `translateY` centres its x-height on the plate).
- Hover and focus do not move the plate or change the header's height.

## Root cause

govuk-frontend 6.5.1, `dist/govuk/components/generic-header/_mixin.scss`, `link-styles`:

- **Hover bar:** lines 87–93, `&:hover, &:active { margin-bottom: -3px; border-bottom: 3px solid; }`. It is **3 px** thick, in the text colour (white).
- **Focus bar:** line 100, `@include govuk-focused-text`. That is a yellow background, `box-shadow: 0 -2px yellow, 0 4px black`, and lines 97–98 remove the border. So the focus bar is **4 px** thick, in black.

Both bars hang from the bottom of the link's **inline content area**. Atkinson Hyperlegible Next at 30 px makes that area 39 px tall, and the logo does not set it. With task 78's geometry (logo padding 19/10, `.app-logo { top: -3px }`), the content area ends 7 px below the plate:

- The hover bar sits 7 px below the plate and 6 px above the header's bottom.
- The focus bar sits 7 px below the plate and 5 px above the header's bottom.

**The two thicknesses cannot share one position.** 16 − 4 = 12 gives the 4 px focus bar 6 / 6. 16 − 3 = 13 is odd, so a centred 3 px bar needs 6.5 / 6.5. Chrome paints an inline box's border and padding on **whole CSS pixels**, at every DPR. I measured this at DPR 1, 2 and 4: `padding-bottom` of 0.25 px paints like 0 px, and 0.5, 0.75 and 1 px all paint like 1 px. So in Chrome the 3 px bar can sit at 6 / 7 or 7 / 6, never at 6.5 / 6.5. The same snapping applies to the focus box's horizontal padding.

## Plan

- Move the line 1 px up and lower the logo 1 px, so the plate stays where it is: `logo-styles(18px, 11px)` and `.app-logo { top: -2px }`. The content area then ends 6 px below the plate, the 4 px focus bar is centred (6 / 6), and the bar is still 62 px tall.
- Focus padding becomes `padding: 1px 6px 0; margin-left: -6px`: 6 px of yellow on every side of the plate's box, as task 78 did with 7 px.
- Hover is left at GOV.UK's 3 px and needs no rule of its own. Its top now matches the focus bar's top (y 52): 6 px above, 7 px below. The other choice (a 4 px hover bar, identical to the focus bar) is measured below for Jakub.

## Acceptance

- Measured in headless Chromium at DPR 4, 375 and 1280 px wide, on production (`conaulicy.pl`) with this branch's declarations injected. The Vercel preview needs a Vercel login, so headless Chromium cannot open it. Ink is the box of pixels of a colour class (white, focus yellow, header black). The black focus bar is measured in a second pass with the header's background set to grey, because black on black has no ink.
- Focus bar: 6 above and 6 below. Yellow box: even, within ±0.25 px against the plate's box (top and bottom are exact).
- Hover bar: 3 px, top at the focus bar's top. A 6.5 / 6.5 split is not possible in Chrome (see root cause).
- The plate's top is the same in normal, hover, focus and hover+focus (y 16), and the header stays 62 px.
- `RAW_PX` in `check-own-css` is updated, and CI is green.

## Result

All values in CSS px (DPR 4, 0.25 px raster steps). The values are the same at 375 and 1280 (at 1280 every x is +145).

### Hover bar (3 px, white)

| | plate ink bottom | bar | above | below |
|---|---|---|---|---|
| before (production) | 46 | 53–56 | 7 | 6 |
| after (this PR) | 46 | 52–55 | **6** | **7** |
| option: 4 px hover bar | 46 | 52–56 | **6** | **6** |

### Focus (yellow box and the 4 px black bar)

| | yellow box (375) | gap to plate's box top / bottom / left / right | gap to logo ink left / right | black bar | above / below the bar |
|---|---|---|---|---|---|
| before | 8–191 × 9–53 | 7 / 7 / 7 / 7 | 7.10 / 7.54 | 53–57 | 7 / 5 |
| after | 9–190 × 10–52 | **6 / 6 / 6 / 6** | 6.10 / 6.54 | 52–56 | **6 / 6** |

- Hover+focus is identical to focus, before and after, because GOV.UK's `:focus` removes the hover border.
- "Ink" here means the logo's path bounding boxes: x 15.10 to 183.46 in the svg box, which runs from 15 to 184. The logo's own ink sits 0.10 px in from the box's left edge and 0.54 px from its right edge. A 5.5 px right padding would even that out, but Chrome paints it as 6 px (whole-pixel snapping), so the box is even against the plate's box, as in task 78.

### No layout shift

| state | header height | plate top | svg top |
|---|---|---|---|
| normal, hover, focus, hover+focus (375 and 1280, before and after) | 62 | 16 | 16 |

### Crops (DPR 4)

In `docs/tasks/task-82/`, for widths 375 and 1280:

- `before-<width>-<state>.png`
- `after-<width>-<state>.png`
- `option-4px-<width>-hover.png`

`<state>` is one of `normal`, `hover`, `focus` and `hoverfocus`.
