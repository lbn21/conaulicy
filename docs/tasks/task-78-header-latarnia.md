# Task 78: header in the Latarnia brand colour (preview only)

Draft PR, Vercel Preview only. Not merged, not marked ready, until Jakub decides.

## Problem

When the header logo is focused, GOV.UK shows a yellow box with its black focus bar underneath, and it looks even because GOV.UK's header is blue. Our Generic header is black: that is govuk-frontend 6.5.1's `generic-header` `block-styles($background-colour: govuk-colour("black"))` default, which nobody chose. On black, the black bar disappears and the yellow box looks cut off at the bottom. The yellow box also seems to hug the plate on the left and the wordmark on the right.

## Root cause

Measured on the focused homepage link in headless Chromium at 1280px, on production and on www.gov.uk:

| | GOV.UK | conaulicy.pl |
|---|---|---|
| yellow above the logo (2px box-shadow + content area) | 3px | 4px |
| yellow below the logo | 6px | 7px |
| black focus bar (box-shadow `0 4px`) | 4px | 4px |
| yellow left / right of the logo | 0 / 0 | 0 / 0.5px |

- **The geometry already matches GOV.UK's.** The same `link-styles`, the same 30px logo, `top: -3px` and padding 16/12 are used. The 1px more above and below comes from Atkinson's taller content area at 30px (39px against GDS Transport's 37px). The yellow is the inline link's content area, so the font sets its height, not the SVG. Neither the `top: -3px` lift nor the wordmark's `translateY` changes the box.
- **What is visibly uneven is the missing bottom edge.** On a black header the black 4px bar is the same colour as the header. So below the logo you see 7px of yellow with no edge, against 4px above. On GOV.UK's blue the bar is visible and closes the box.
- **Left and right:** GOV.UK's yellow is also flush with its SVG. The crown only looks padded because its edges are small round dots. Our plate is a solid rectangle, so flush reads as cut off.
- **Optical centre (Jakub's addition):** the box has to sit evenly round plate + wordmark as you see them, not round the link's box. The header wordmark is shifted down on purpose (`HEADER_WORDMARK_SHIFT`, `translateY(4.12%)`), so its x-height is centred on the plate and the "y" descender stays inside the plate's height (wordmark ink 0.9px below the plate top, 3.5px above its bottom). That makes the plate's box the logo's optical frame. Centring on the wordmark's ink box instead would put the box off-centre against the plate.

## Change

`web/app/site.scss`: `.govuk-generic-header` includes govuk-frontend's own `generic-header.block-styles` with `$background-colour: govuk-functional-colour("brand")` and `$text-colour: govuk-functional-colour("inverse-text")`. This is exactly what `components/header/_mixin.scss` does for the GOV.UK header. `brand` is Latarnia primary #9a5700 (`_settings.scss`). There is no raw colour, and the focus styles are unchanged.

The header plate is GOV.UK white (`govuk-colour("white")`) instead of amber (Jakub's choice, as GOV.UK's white crown on its blue). The cut-out "ul." and the rim show the header colour through it. The amber `plate` value stays in `_palette.scss` for dark bars, and the PDF keeps its own amber. On focus the plate still takes `currentColor` (black on yellow).

Also in `site.scss`, on `.govuk-generic-header__homepage-link:focus` only: `padding: 3px 7px 0; margin-left: -7px`. This gives an even 7px of yellow round the plate's box on all four sides (measured: 7 / 7 / 7.1 / 7.5 at 375px and 1280px), above GOV.UK's unchanged black bar. Inline padding does not change the line box, and the negative margin cancels the left padding, so the logo stays where it is (checked). This is a deviation from GOV.UK's link-styles, which have no focus padding, and needs Jakub's approval. The two declarations are added to `RAW_PX` in `scripts/check-own-css.mjs`. The values depend on Atkinson's content area at 30px (not checked with the fallback font).

## Acceptance

- Focused, the yellow is visually even round plate + wordmark: 7px on every side of the plate's box, and the logo does not move.
- Header background #9a5700, white text, white plate with the "ul." and rim in the header colour (5.62:1). Focus stays GOV.UK's yellow with the black bar, and the bar is visible under the focused logo.
- `check-own-css`, `biome check` and CI green. Vercel Preview built.
- Contrast numbers and screenshots (Preview against production, 375px and desktop; normal, hover, focus) in the PR.
- Nothing else changed: PDF, OG image, favicons, theme-color and docs are listed in the PR as follow-ups for if Jakub approves.
