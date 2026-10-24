# Task 84: cleanup after tasks 78–83 (docs + tiny CSS)

Draft PR, one branch (`chore/84-cleanup`). No rendering change, no database, no `next build/start/dev` locally (CI builds).

## Changes

1. **`web/app/site.scss`: `vertical-align: top` removed from `.app-logo`.** A duplicate: govuk-frontend 6.5.1 `components/generic-header/_mixin.scss` (`styles`) sets `.govuk-generic-header__homepage-link > * { vertical-align: top; }`, and the logo SVG is the link's direct child (`site-header.tsx`). Same specificity (0,1,0), same value, so nothing changes. The comment now says where it comes from.
2. **`web/app/_palette.scss`: the `"plate": #ffb547` entry removed.** Nothing reads it: the only `map.get($app-latarnia, …)` calls (`_settings.scss`) use primary, shade-10, shade-50, tint-95 and tint-50, and a repo-wide grep finds no other `"plate"` key in Sass, TS or scripts. The site header (task 78) and the PDF (task 79) draw the plate white.
3. **`site.scss` comment on the logo padding.** It said "GOV.UK's padding 16/12", which is the **GOV.UK header's** `.govuk-header__logo` (`components/header/_mixin.scss`: 16px top, 14px − 2px bottom). The **Generic header's** default is `govuk-spacing(3)` both ways, **15/15**. The comment now names both; ours stays 18/11, `top: -2px`, 4px hover and focus bars (task 82).
4. **Docs.**
   - `docs/brand.md`: header plate white (GOV.UK white on the Generic header's black, 19.59 : 1), not amber `#ffb547` (11.15 : 1), in the "Where it ships" table, the logo colours and the contrast table; the dark logo files are not what the header uses; the header mark is 30 px (P = 7.5 px), not 32 px; the header's `site.scss` rules listed as they are now (18/11, `top: -2px`, 62 px bar, 4 px bars, even 6 px focus box); the PDF band's plate is white.
   - `docs/govuk-audit.md`: the logo plate's colours, the contrast row, the own-CSS rule ("no px" except `RAW_PX`), the logo item's geometry, and the warning-text icon (task 83) added to the own-CSS list.
   - Grepped `docs/` (not `docs/tasks/`) for amber plate, `#ffb547`, 19/10, 16/12, 7 px focus box, 3 px hover bar, 32 px header. Left as they are, because they are still true: `docs/logo/README.md`'s enamel hero (backlog) and its logo-variant proposals, and the kickoff report (history).
5. **`CLAUDE.md`:** a standing "Pixel perfect" rule under UI rules.

## Not changed (outside this task's list)

`design/tokens.css` (`--logo-plate: #ffb547`) and `design/contrast.mjs` (`"logo-plate": "#ffb547"`, run in CI) still check the old amber plate against the header. The white plate passes easily (19.59 : 1), but the check describes the old header. That needs a follow-up task.

## Proof that rendering does not change

- **Compiled CSS:** `govuk.scss` + `site.scss` compiled with the repo's `sass` (expanded), main against this branch: the only difference is the one `vertical-align: top;` line in `.app-logo`. The palette entry and the comments compile to nothing.
- **Screenshots:** headless Chromium (Playwright 1248), DPR 2, production `conaulicy.pl` (main, with task 83 live). Before: the production CSS as served. After: the same CSS with `vertical-align:top` removed from the `.app-logo` rule (the CSSOM rule confirmed in both runs: `.app-logo { vertical-align: top; margin-bottom: 2px; position: relative; top: -2px; }` against `.app-logo { margin-bottom: 2px; position: relative; top: -2px; }`). Pages `/` and `/adres/0605950`, 375 and 1280 px wide. Header (default, hover, focus) and footer.

| width | page | header | header hover | header focus | footer |
|---|---|---|---|---|---|
| 375 | `/` | 0 px | 0 px | 0 px | 0 px |
| 375 | `/adres/0605950` | 0 px | 0 px | 0 px | 0 px |
| 1280 | `/` | 0 px | 0 px | 0 px | 0 px |
| 1280 | `/adres/0605950` | 0 px | 0 px | 0 px | 0 px |

Every before/after pair is byte-identical (same SHA-1), so the pixel diff is 0. The logo box is the same in both: 169 × 30 at y = 16 (x = 15 at 375, x = 160 at 1280).
