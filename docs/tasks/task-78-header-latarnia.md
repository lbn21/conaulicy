# Task 78: header logo, white plate, centred, even focus box (preview only)

Draft PR, Vercel Preview only. Not merged, not marked ready, until Jakub decides.

## Outcome (Jakub's decisions)

- **The header bar stays GOV.UK's default black Generic header.** We tried the Latarnia brand colour (#9a5700) and dropped it.
- **The plate is GOV.UK white** (`govuk-colour("white")`), as GOV.UK's white crown. The cut-out "ul." and rim show the header's black. The amber `plate` value stays in `_palette.scss`, and the PDF keeps its own amber.
- **The plate is centred in the bar:** logo container padding 18/10 instead of GOV.UK's 16/12. This is a deviation from GOV.UK's magic numbers.
- **The focus box is an even 7px round the plate.** It uses focus-only padding, a deviation from GOV.UK's link-styles.
- Jakub accepts that GOV.UK's black focus bar is invisible on black, as on GOV.UK's own black header. The yellow box is the indicator (14.55:1 on black).

## Problem

- On focus, the yellow box around the header logo looked cut off and uneven.
- The logo sat high in the bar: 39 device px above the plate, 54 below.

## Root cause

Measured in headless Chromium, 375 and 1280 (same at both), CSS px:

- **Focus box:** the yellow is the inline link's content area, so the font sets it, not the logo. Atkinson at 30px is 39px tall. That leaves 4px of yellow above the plate (2 of them GOV.UK's box-shadow), 7px below, and none at the sides.
  - GOV.UK's box is flush at the sides too. Its crown only looks padded because its edges are small round dots. Our plate is a solid rectangle, so flush reads as cut off.
  - The header wordmark is shifted down on purpose (`HEADER_WORDMARK_SHIFT`, `translateY(4.12%)`), so its x-height is centred on the plate and the "y" stays within the plate's height. So the plate's box is the logo's optical frame, and the focus box is centred on it.
- **Vertical position:** GOV.UK's padding 16/12 puts its own logo at 13px above and 18px below in the 61px bar; GOV.UK's header example measures the same. That reads fine with the airy crown but not with a solid plate. The font's content area does not affect it, because the bar's layout uses the 30px line-height.

## Change (`web/app/site.scss`)

1. `.app-logo__plate` fill: `govuk-colour("white")` instead of the amber `plate`. `@use "sass:map"` is dropped, as the plate was its only use.
2. `.govuk-generic-header__logo`: `logo-styles($padding-top: 18px, $padding-bottom: 10px)`. The sum is the same, so the bar is the same height. The logo, its `top: -3px` lift, the wordmark's centring, the hover underline and the focus box all move down 2px together.
3. `.govuk-generic-header__homepage-link:focus`: `padding: 3px 7px 0; margin-left: -7px`. Inline padding leaves the line box alone, and the negative margin cancels the left padding, so the logo does not move on focus.

`scripts/check-own-css.mjs`: `RAW_PX` takes the 18/10 padding and the two focus declarations.

## Measurements

| | bar | above plate | below plate (incl. 1px transparent border) | focus box top / bottom / left / right | hover underline below plate |
|---|---|---|---|---|---|
| production (16/12) | 61 | 13 | 18 | 4 / 7 / 0.1 / 0.5 | 7 |
| this PR (18/10) | 61 | 15 | 16 | 7 / 7 / 7.1 / 7.5 | 7 |

An exact split is not possible: a 61px bar minus a 30px plate leaves 31px. Chromium snaps the SVG to whole pixels, so 18.5/9.5 renders as 16/15. 15/16 leaves the plate half a pixel above centre. An exact split needs a 60 or 62px bar (padding 18/9 or 18/11).

## Contrast (WCAG 2.2)

| pair | ratio |
|---|---|
| white wordmark on black #0b0c0c | 19.59 |
| white plate on black (non-text) | 19.59 |
| "ul." cut-out and rim (black through the white plate) | 19.59 |
| focus yellow #ffdd00 on black | 14.55 |
| focused plate and wordmark, black on yellow | 14.55 |
| GOV.UK's black focus bar on black | 1.00 (invisible, accepted) |

## Acceptance

- Black Generic header as GOV.UK's default, white plate with the "ul." and rim in black.
- Plate centred in the 61px bar, 15 above and 16 below (was 13 / 18), bar height unchanged.
- Focused, an even 7px of yellow round the plate, and the logo does not move. Hover underline unchanged, 7px below the plate.
- `check-own-css`, `biome check` and CI green. Vercel Preview built.
- Screenshots (production against this branch's CSS on production, 375 and 1280; normal, hover, focus, focus close-up) in `docs/tasks/task-78/` and the PR.
- Nothing else changed. Follow-ups for consistency are listed in the PR.
