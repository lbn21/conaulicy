# Task 73: the logo on keyboard focus, as GOV.UK's

Approved by Jakub, 23 Oct 2026.

## Problem

When the header's homepage link has keyboard focus, it gets GOV.UK's focus state from the Generic header's `link-styles`: `govuk-focused-text`, a focus-yellow background (#ffdd00) and the focus-text colour (#0b0c0c). The wordmark is `fill="currentColor"`, so it turns black. The "ul." plate, though, keeps its own fill, `.app-logo__plate { fill: map.get($app-latarnia, "plate") }` (#ffb547). The "ul." and the rim are cut out of the plate with a mask, so they show the yellow behind them.

- Result: an amber plate on yellow, at **1.30:1**, which fails WCAG 1.4.11 (non-text contrast, 3:1).
- Screenshots: `header-fixed-1024-focus.png`.

GOV.UK's header does it differently: its logo is `fill: currentcolor`, so on focus everything in the link goes the focus-text colour, black on yellow.

## Do

On focus only, the plate takes the link's colour (`currentColor`, i.e. GOV.UK's focus-text black). The rim and the "ul." stay cut-outs, so they read as focus yellow in a black plate. That is the same lockup as on the black bar, inverted, and the same as GOV.UK's "everything goes black".

- **Default and hover:** unchanged, pixel for pixel.
- **Root-cause approach:** the plate's fill comes from one CSS custom property whose fallback is the amber. GOV.UK's existing focus state then switches it to `currentColor`, with no new focus styling of our own:
  - no second background, outline or box-shadow;
  - no JS;
  - no hard-coded black: use `currentColor`.

  For example: `.app-logo__plate { fill: var(--app-logo-plate, <amber>) }`, plus a single `.govuk-generic-header__homepage-link:focus { --app-logo-plate: currentColor }`. Or the cleanest equivalent you find.
- **`:focus` vs `:focus-visible`:** use `:focus`, matching the selector GOV.UK's `link-styles` uses, so the plate changes exactly when the yellow appears.
- **Guards:** keep within the `site.scss` cap. `check-own-css` must stay green with no new raw colours or px (the amber stays `map.get($app-latarnia, "plate")`).
- **`design/contrast.mjs`:** add the focused logo as a "ui" pair, so the check covers it:
  - a palette entry `"logo-plate-focus": "#0b0c0c"` (the focus-text colour, with a comment that it is currentColor on focus);
  - the pair `["logo-plate-focus", "focus", "ui"]`.

  Run `node design/contrast.mjs` (plain node, no env) and paste its plate/focus lines in the PR body.
- **Docs:** update the comments in `site-header.tsx` and `site.scss`, and `docs/brand.md` / `docs/logo/README.md` if they describe the header lockup states. Add one line: on focus, a black plate with the "ul." in focus yellow.

## Acceptance (I will verify on prod with headless Chromium)

- On `:focus` at 375 and 1024, the plate's computed fill is rgb(11, 12, 12): 14.55:1 against #ffdd00, so ≥ 3:1. The "ul." and rim visibly show yellow inside it.
- The default and hover computed fills and the screenshots are unchanged: amber plate, light wordmark, 3px hover border.
- The header geometry from task 72 is unchanged: 61px header, logo 169×30, 7px gap.
- CI is all green.

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Running `node scripts/check-own-css.mjs` and `node design/contrast.mjs` locally is fine.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `fix/logo-focus` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
