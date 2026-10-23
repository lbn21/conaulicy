# Task 72: header logo geometry and hover underline as GOV.UK's header

Reported by Jakub, 23 Oct 2026: in our header the hover underline touches the "conaulicy" letters, while GOV.UK keeps a gap. He also thinks GOV.UK's header is taller.

## Measured (headless Chromium, 375 and 1024 px, identical at both widths)

| | header block (incl. 1px transparent border) | logo container padding | logo | logo top → bottom in header | hover underline (3px border-bottom) top | gap logo bottom → underline |
|---|---|---|---|---|---|---|
| GOV.UK Design System header (govuk-frontend 6.x, `.govuk-header`) | 61 | 16 / 12 | 162×30 | 13 → 43 | 49 | **6** |
| www.gov.uk (its own header, no border) | 62 | 16 / 12 | 162×30 | 14 → 44 | 50 | **6** |
| conaulicy.pl (`.govuk-generic-header`) | 63 | 15 / 15 | 180×32 | 15 → 47 | 49 | **2** (the "y" descender touches) |

The default and focus states match GOV.UK's: no decoration by default; on focus a yellow background and black bar from `govuk-focused-text`. Ours is not shorter. gov.uk only looks taller because its homepage's blue continues below the header.

## Root cause

We use GOV.UK Frontend 6.5.1's **Generic header** (correct for a non-GOV.UK site: no crown, no brand blue). Its logo rules are generic: `.govuk-generic-header__logo` has 15/15 padding (`logo-styles` defaults), and there is no rule for the logo image itself. GOV.UK's own header gets its gap from two things in `components/header/_mixin.scss`:

- `.govuk-header__logo` uses `logo-styles($padding-top: 16px, $padding-bottom: 12px)`;
- `.govuk-header__logotype` is 30px tall, `position: relative; top: -3px; margin-bottom: 2px; vertical-align: top`.

That lifts the logo 3px off the line, so the 3px hover border (`link-styles`, shared by both headers) sits 6px below it. Our SVG is 32px tall, sits on the line with no lift, and `site.scss` `.app-logo__wordmark` shifts the wordmark a further ~1.3px down (the x-height centring, task 6a0004f). So the bottom of the "y" lands 2px above the underline.

## Do

Give our logo GOV.UK header's logo geometry, using GOV.UK Frontend's own Sass where it exists. Keep our colours, the black bar, the "ul." plate, the Latarnia, the wordmark and its x-height centring.

1. **Logo size:** our SVG becomes 30px tall, GOV.UK's logotype height. Keep the aspect ratio from `lib/logo.ts` (LOGO_WIDTH/LOGO_HEIGHT), so it is about 169px wide. Change the `width`/`height` in `components/site-header.tsx`, preferably computed from the constants rather than literals.
2. **Logo container padding 16/12:** prefer `@use "govuk-frontend/dist/govuk/components/generic-header/mixin"` and `@include` its `logo-styles(...)` with GOV.UK header's arguments, rather than hand-written padding. Write the override as `.govuk-generic-header__logo` in `site.scss`.
3. **The logo's lift, as `.govuk-header__logotype`:** `top: -3px` relative, `margin-bottom: 2px`, `vertical-align: top`. Put it on `.app-logo` in `site.scss`. Do not load the GOV.UK header component's CSS: it brings brand-blue rules that `check-govuk-assets` forbids.
4. **Raw px:** `check-own-css` bans raw px in `site.scss`, and GOV.UK writes these as magic px. Do not loosen the general rule. Prefer GOV.UK's own functions where they give the exact value (e.g. `govuk-px-to-rem` is still a px literal, so no). If literals are unavoidable, add the narrowest exception: an explicit list of the exact declarations, each with a comment naming `components/header/_mixin.scss` as its source. Show it in the PR body.
5. **Hover/active/focus:** these stay exactly GOV.UK's `link-styles`, unchanged (3px border-bottom on hover/active, `govuk-focused-text` on focus). Add no `text-decoration` or `text-underline-offset` of our own.
6. Update the comments in `site-header.tsx` and `site.scss` that describe the logo placement, and `docs/logo/README.md` if it states the header logo size.
7. The PDF header uses `HEADER_WORDMARK_SHIFT` from `lib/logo.ts`. Leave the PDF unchanged.

## Acceptance (I will re-measure on prod with the same script)

- At 375 and 1024 px, the gap from the bottom of the logo SVG box to the top of the hover underline is ≥ 6px, and the "y" descender visibly clears it.
- The header block is 61px (incl. the 1px border) as GOV.UK's header, and the logo container padding is 16/12.
- Default: no decoration. Hover: 3px solid border-bottom with -3px margin. Focus: GOV.UK focus state. All unchanged.
- The logo is about 169×30. Colours, plate and wordmark are unchanged apart from the size.
- All of CI is green, including `check-own-css` (class guard), `check-govuk-assets`, a11y, W3C and perf.

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. `node scripts/check-own-css.mjs` locally is fine.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `fix/header-logo-geometry` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
