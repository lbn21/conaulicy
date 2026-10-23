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
- **Left and right:** GOV.UK's yellow is also flush with the logo's SVG on both sides. The crown only looks padded because its edges are small round dots. Our plate is a solid rectangle flush with the edge. Adding side padding would be a deviation from GOV.UK. It is not done here (see the PR for the proposal).

## Change

`web/app/site.scss`: `.govuk-generic-header` includes govuk-frontend's own `generic-header.block-styles` with `$background-colour: govuk-functional-colour("brand")` and `$text-colour: govuk-functional-colour("inverse-text")`. This is exactly what `components/header/_mixin.scss` does for the GOV.UK header. `brand` is Latarnia primary #9a5700 (`_settings.scss`). There is no raw colour, and the focus styles are unchanged.

## Acceptance

- Header background #9a5700, white text. Focus stays GOV.UK's yellow with the black bar, and the bar is visible under the focused logo.
- `check-own-css`, `biome check` and CI green. Vercel Preview built.
- Contrast numbers and screenshots (Preview against production, 375px and desktop; normal, hover, focus) in the PR.
- Nothing else changed: PDF, OG image, favicons, theme-color and docs are listed in the PR as follow-ups for if Jakub approves.
