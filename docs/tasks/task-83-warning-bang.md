# Task 83: the "!" in the warning-text icon, centred in the circle

Draft PR, one branch (`ui/83-warning-bang`): `web/app/site.scss`, `web/scripts/check-own-css.mjs` and this brief, plus crops in `docs/tasks/task-83/`. No drive-by changes, no database, no `next build/start/dev` locally.

## Goal

The "!" in GOV.UK's warning-text icon (`.govuk-warning-text__icon`, the 35 px black circle) is optically centred with Atkinson Hyperlegible Next: equal ink gaps top/bottom and left/right within ±0.5 px (ideally ±0.25), at 375 and 1280 px wide, DPR 4. The circle's size and position, the text and the layout around it do not change.

## Where the warning shows

Only `web/components/place-page.tsx` renders it, on every place page whose schedule is not verified (`!place.verified`). On production that is 319 of the 324 pages in the sitemap (all `/adres/…` pages fetched and searched for `govuk-warning-text`).

## Root cause

govuk-frontend 6.5.1, `dist/govuk/components/warning-text/_mixin.scss`: the icon is 35 × 35 (border-box, 3 px border, so a 29 px content box), `font-size: 30px; line-height: 29px`, `text-align: center`. The "!" inherits the warning's bold.

- **Vertical: font metrics.** Atkinson Hyperlegible Next Bold (the served woff2): ascent 984, descent 316 of 1000 units per em (hhea = typo, `USE_TYPO_METRICS`), so a 39 px content area at 30 px. The "!" ink runs from −12 to 668 units around the baseline. In a 29 px line Chrome puts the baseline 28 px below the circle's top (3 border + 30 rounded ascent − 5 half-leading). So the ink runs from 7.96 to 28.36: **7.96 above, 6.65 below**, 0.65 px low. GOV.UK's 29 px suits GDS Transport (6.99 / 6.72 on GOV.UK's own page).
- **Horizontal: no fault in Chrome.** The "!" has equal side bearings (60 and 60 units on a 303-unit advance), and the icon sits on a whole pixel, so `text-align: center` centres it: 14.74 / 14.75. I could not reproduce the audit's 14.25 / 15.25 in Chromium or Chrome. WebKit does show a left/right offset (14.50 / 14.97), see below.
- **Chrome draws text on whole CSS px of the page, at every DPR.** Measured at DPR 4: `padding-top` of 0.25 to 0.5 px under `line-height: 28px` leaves the "!" where it is, and 0.75 px moves it a full 1 px. Line-heights from 27 to 28 px all give the same result. A fractional `translate` with the margin offset by the same amount does not help either: Chrome snaps a transformed box's paint offset to a whole pixel first, so the circle moved 0.25 px down with the "!" and the gap between them stayed whole. So the "!" can only move against its circle in steps of 1 px. The circle's sub-pixel position is set by the content above it: on all 319 pages at both widths it is .953 to .984 of a pixel, which Chrome paints on the whole pixel. So the only splits Chrome offers are 7.96 / 6.65 (now) and 6.96 / 7.65 (1 px higher).

**So ±0.5 px is not reachable in Chrome with CSS on this element** without moving the circle, changing the "!"'s size, or changing GOV.UK's markup, which the task and CLAUDE.md rule out.

## Change

`.govuk-warning-text__icon { line-height: 28px; }` in `site.scss`, the closest Chrome allows: the "!" moves 1 px up. GOV.UK's `min-height: 35px` keeps the circle 35 px tall, in the same place. It is a deviation from GOV.UK's 29 px, documented in the comment, and `"line-height: 28px;"` is added to `RAW_PX` in `check-own-css`.

## Acceptance

- Headless Chromium (Playwright's build 1248) at DPR 4, 375 and 1280 px wide, on production with this branch's compiled `site.scss` injected (as in task 82). Pages: `0606234-57638`, `0972447-48942` (the one at phase .953), `0972447-09223` and `0605950`. All give the same numbers.
- Ink is measured against the painted circle (its dark pixels), not the box. "Raster" is the gap in whole 0.25 px device pixels with ink above 50 % coverage. "Sub-pixel" adds the coverage of the edge pixel.
- No layout shift: the icon, text, warning and next element boxes and the page height are identical before and after. The circle's pixels are identical; only the "!" changes (496 device pixels, all inside the glyph's box).

## Result

CSS px. Identical at 375 and 1280, on all four pages.

| | top / bottom (raster) | top / bottom (sub-pixel) | top − bottom | left / right (raster) | left / right (sub-pixel) |
|---|---|---|---|---|---|
| GOV.UK, GDS Transport (reference) | 7 / 6.75 | 6.99 / 6.72 | +0.27 | 14.75 / 14.75 | 14.70 / 14.71 |
| before (production) | 8 / 6.75 | 7.96 / 6.65 | **+1.31** | 14.75 / 14.75 | 14.74 / 14.75 |
| after (this PR) | 7 / 7.75 | 6.96 / 7.65 | **−0.69** | 14.75 / 14.75 | 14.74 / 14.75 |

- **Not met:** top = bottom within ±0.5. The error halves (0.65 px low → 0.35 px high) but stays outside the target, for the reason above.
- **Met:** left = right within ±0.25 (−0.01), before and after.

### WebKit (Playwright WebKit, a cross-check, not the target)

| | top / bottom (sub-pixel) | top − bottom | left / right (sub-pixel) |
|---|---|---|---|
| GOV.UK reference | 6.99 / 6.71 | +0.28 | 14.50 / 14.75 |
| before | 7.46 / 7.15 | +0.31 | 14.50 / 14.97 |
| after | 6.96 / 7.65 | −0.69 | 14.50 / 14.97 |

WebKit already sits within ±0.5 vertically today, and this change takes it to −0.69, so **Safari gets worse while Chrome gets better**: both end at −0.69. WebKit's left/right offset (−0.47) is its own text positioning and is also there on GOV.UK (−0.25). Firefox would not launch headless in this sandbox and is not measured.

### Crops (DPR 4)

In `docs/tasks/task-83/`, page `0605950`, the icon with 4 px round it: `before-375.png`, `before-1280.png`, `after-375.png`, `after-1280.png`.

## For Jakub

The target cannot be met in Chrome with a CSS change to this element. The options:

1. **This PR:** Chrome +1.31 → −0.69, Safari +0.31 → −0.69.
2. **Leave GOV.UK's 29 px:** Chrome stays at +1.31, and Safari stays at +0.31.
3. **Something bigger:** a different "!" size, or drawing the "!" some other way, such as a text-shadow copy at a fractional offset. Both are bigger deviations from GOV.UK and need your approval.
