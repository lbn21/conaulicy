# GOV.UK Design System audit (phase 1: foundations, forms, buttons)

**Scope:** task 25, narrowed by Jakub on 2026-10-20. This covers:
- styles: layout, typography, spacing, focus, links;
- forms: text input, label, hint, error message, error summary, search;
- buttons.

Everything else is on one "later" line.

**Reference:** GOV.UK Frontend **v6.5.1**, the newest release more than two weeks old (6.6.0 is from 2026-10-15). Values are measured from its Sass and JS source; `S/` means `https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/`. The pages read are in [`govuk-audit-sources.md`](govuk-audit-sources.md).

**Checked against:**
- the code in `web/`;
- the pages `/`, `/adres/0972447-00470`, `/dostepnosc`, `/prywatnosc` and the 404 page;
- the PDF, which has no forms, links or focus states, so nothing there is in scope.

## Decisions (Jakub, 2026-10-20)

**Rule:** "GOV.UK Frontend as-is, including its palette; only the brand-blue roles, the typeface and the logo are ours." No other deviations without Jakub's approval.

- **Package:** the official `govuk-frontend` npm package (6.5.1, exact pin), via its documented Sass settings. No `govuk-frontend` JS (no used component strictly needs it).
- **Palette:**
  - GOV.UK's own palette and functional colours are kept: yellow focus, green button, red error, green success, black/grey text and borders, white.
  - Only the **brand-blue group** is replaced, by a Latarnia amber/brown group computed with GOV.UK's tint/shade method. It feeds brand, link, link hover, template and surface background, and surface border.
  - Visited links have no colour of their own: `link-visited` is the link colour (D5).
- **Typeface and logo:** Atkinson Hyperlegible Next instead of GDS Transport. Our "ul." plate in the GOV.UK **Generic header** (its default black bar, so the dark-background lockup). Our own footer.
- **Light only, Polish copy.** Dark mode was dropped on 2026-10-20 to follow GOV.UK, which is light only: no toggle, no `prefers-color-scheme: dark` styles, no theme script.
- **Everything else is exactly GOV.UK:**
  - 40 px controls, `:focus` styling;
  - the 960 px container and grid, 19 px body, every size, spacing step, type scale and breakpoint, and the page template;
  - GOV.UK markup and classes for every form element and button.
- **Almost no own CSS:**
  - Tailwind is removed.
  - The UI is built from GOV.UK components, grid, typography, override and width classes.
  - One small `web/app/site.scss` (logo plate, bin markers, search suggestions) uses GOV.UK Sass functions only, and is capped in CI.

## Summary

### Top 10 gaps (against GOV.UK Frontend as-is)
1. **Not built on `govuk-frontend` at all.**
   - Tailwind utilities and our own tokens.
   - No `govuk-template`, `govuk-width-container`, `govuk-main-wrapper` or `govuk-grid-row`.
   - No GOV.UK classes anywhere.
2. **Focus states:**
   - a 3 px ring with 3 px offset on `:focus-visible`;
   - not GOV.UK's link focus (fill + 4 px dark underline), input focus (3 px outline + inset 2 px border) or button focus (fill + dark 2 px edge);
   - the light focus colour is dark brown `#6b3d00`, not GOV.UK's yellow fill with a black edge.
3. **Buttons:**
   - no `govuk-button`: 4 px corners, 56 px tall, bold 22 px text;
   - no bottom shadow, no hover colour, no pressed offset;
   - no GOV.UK focus state.
4. **No error pattern at all.**
   - An unknown house number shows a bold note. There is no error summary, no "Błąd: " title prefix, no `govuk-form-group--error` bar, no `govuk-error-message` and no `govuk-input--error` border.
   - An empty number has no message.
5. **Inputs are not `govuk-input`:**
   - 56 px tall instead of 40 px;
   - grey border instead of the input-border (text) colour;
   - 4 px radius instead of 0;
   - 22 px text instead of 19 px;
   - 16 px padding instead of 5 px.
6. **Placeholder** "np. Słowackiego" on the search. GOV.UK: "Do not use placeholder text in place of a label, or for hints or examples".
7. **Links:**
   - text-coloured with a fixed 2 px underline;
   - no link, hover or visited colour;
   - no hover thickening;
   - underline offset `.2em` instead of `.1578em`.
8. **Labels and hints:**
   - 22 px bold labels with uniform 8 px gaps;
   - not `govuk-label` / `govuk-label--m` and `govuk-hint` spacing (5 / 10 / 15 px).
9. **Type scale:**
   - body 18 px / 1.55, against 19 / 25;
   - headings 36→48 and 22, against `govuk-heading-xl/l/m` 32→48, 27→36, 21→24;
   - looser line heights.
10. **Layout and template:**
    - a 672 px column with 16 / 32 px gutters, against the 960 px container with 15 / 30 px gutters;
    - a 4 px spacing rhythm, against the GOV.UK 5 px responsive scale;
    - `h1` margins instead of `govuk-main-wrapper` padding;
    - no skip link;
    - a dark-default theme with a toggle.

### Approach: the official `govuk-frontend` package (decided)

The audit first recommended re-implementing the specs on Tailwind tokens. Jakub decided on GOV.UK Frontend as-is; the measured numbers stay as context.

| | `govuk-frontend` 6.5.1, configured for us | (earlier option) specs on Tailwind tokens |
|---|---|---|
| CSS, **our build**: GOV.UK palette + amber group + Atkinson via settings; base, core, objects, skip link, generic header, button, input (+ label, hint, error message), error summary, details, summary list, inset text, tag | 63.0 KB raw, **7.7 KB gzip**; no GDS Transport `@font-face` (`$govuk-include-default-font-face: false`) | n/a |
| CSS, generic subset with GOV.UK colours (base, core, objects, button, input, error summary, fieldset, radios, skip link) | 36.3 KB raw, 5.35 KB gzip | 4.0 KB raw, 1.27 KB gzip (scratch prototype) |
| JS | **0 KB** (below). The optional Button + ErrorSummary JS would be 2.54 KB gzip | 0 KB |

**Budget.**
- **CSS:**
  - Today Tailwind + tokens is 4.9 KB gzip.
  - The target is about 7.7 KB (GOV.UK) plus `site.scss` (capped at 1 KB), so about **8.7 KB, +3.8 KB**. That's within the agreed "about +5 KB".
  - While both coexist during the migration, CSS peaks around +7–8 KB, until Tailwind is deleted in the last PR.
- **JS falls:** the theme toggle is removed in PR 1, and nothing is added.
- **CLS:** none. Static styles; the pressed button uses `position: relative; top: 2px`.

**Why no `govuk-frontend` JS.**
- **Error summary:** focused on load by server-rendered `autofocus` on the summary, which has `tabindex="-1"` (verify in PR 7). Its links are plain `#field` anchors.
- **Buttons:** our forms are idempotent GET forms, so there's no double-click guard. "Dodaj do kalendarza" uses GOV.UK's link-button markup without the Space-key module; it navigates.
- **Skip link:** `<main id="main-content" tabindex="-1">` in the markup.
- **Details:** the native `<details>` element.

**Tailwind is removed entirely.**
- It stays only while pages are still being migrated.
- Each PR converts its area to GOV.UK classes and deletes the utilities it replaces.
- The last PR deletes the Tailwind dependencies, config and PostCSS setup.
- This is cleaner than removing it in PR 1, which would have to rebuild every page at once.

**Settings** (per [Using GOV.UK Frontend without GOV.UK branding](https://frontend.design-system.service.gov.uk/using-govuk-frontend-without-govuk-branding/)): one palette definition, no scattered hex.

```scss
@use "sass:map";
$app-latarnia: ( /* the amber group below */ );
@use "pkg:govuk-frontend" as * with (
  $govuk-font-family: ("Atkinson Hyperlegible Next", arial, sans-serif),
  $govuk-include-default-font-face: false,   // Atkinson stays self-hosted via next/font
  $govuk-functional-colours: (
    brand: map.get($app-latarnia, "primary"),
    link: map.get($app-latarnia, "shade-10"),
    link-hover: map.get($app-latarnia, "shade-50"),
    template-background: map.get($app-latarnia, "tint-95"),
    surface-background: map.get($app-latarnia, "tint-95"),
    surface-border: map.get($app-latarnia, "tint-50")
  )
);
```

- **Nothing else is overridden:** the green button, yellow focus, red error and black Generic header are GOV.UK's own defaults.
- **Blue leftovers:** the compiled CSS was checked for brand-blue values. Two rules still contain them:
  - the **default `govuk-tag`**, which hard-codes a blue tint and shade;
  - the **inverse button**, which hard-codes blue.
- **Rule:** we never use either. Tags always get a colour modifier (`govuk-tag--grey`, `--green`, …), and there is no inverse button. The own-CSS check flags `govuk-tag` without a modifier.
- **Exception, approved by Jakub and the tech lead (task 27, step 5):** brand blue ships **only** in the unused `.govuk-button--inverse` rules.
  - govuk-frontend 6.5.1 hard-codes the inverse button's hover (`#f4f8fb`) and shadow (`#0f385c`) in [`button/_mixin.scss#L29-L30`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L29-L30), with no setting. They compile whenever the button component is imported.
  - They are never rendered.
  - `check-govuk-assets.mjs` allows blue only inside `.govuk-button--inverse` rules and fails on blue anywhere else.
  - `check-own-css.mjs` fails if any page uses `govuk-button--inverse`.
- **Second exception, approved by Jakub (task 27, step 5c):** alphagov accessible-autocomplete's unchanged CSS paints the highlighted and hovered suggestion in `#1d70b8` (`.autocomplete__option--focused,.autocomplete__option:hover`).
  - `site.scss` overrides only that rule's colours with the brand role (`govuk-functional-colour(brand)`, white text), outside forced-colours mode, so the blue is never rendered.
  - `check-govuk-assets.mjs` allows `#1d70b8` only in that exact rule and fails unless the override ships.
- **`theme-color`:** `#9a5700`, the brand (latarnia primary), as GOV.UK's template uses its brand colour.

**Autocomplete: alphagov `accessible-autocomplete` vs our combobox, restyled with GOV.UK classes**

| | `accessible-autocomplete` 3.0.2 | Our combobox, restyled |
|---|---|---|
| JS (gzip) | **+18.99 KB** standalone (bundles Preact 8); +15.66 KB for the React build | **3.1 KB** today (search logic + index loading); restyle ≈ 0 |
| CSS (gzip) | +0.95 KB (its own stylesheet, not GOV.UK classes) | ≤ 1 KB within `site.scss` (suggestion list), using GOV.UK mixins |
| First-load JS on `/` | 142.1 → ~158 KB: **over the 150 KB budget**, breaks "JS must not grow" | unchanged |
| a11y | Mature, GDS-tested; `role="combobox"`, live region; known issues with some screen readers | ARIA 1.2 combobox, live region, `check-search` (keys, no layout shift), axe clean |
| Fit | An async `source(query, populateResults)` can call our index and the `/api/search` fallback. House numbers need custom `templates`. Its Preact runtime sits beside React | Already built on the cached index + fallback + house-number readings |

**Keep our combobox.** Its input becomes `govuk-input` with `govuk-label`/`govuk-hint`; the list moves to `site.scss`, with GOV.UK focus colours on the highlighted row. `accessible-autocomplete` would cost about 16–19 KB gzip of JS and break the budget, for no functional gain.

## Use outside GOV.UK: we must not look like a government service

From the Service Manual, *Making your service look like GOV.UK*, section "If your service is not on GOV.UK" (https://www.gov.uk/service-manual/design/making-your-service-look-like-govuk, last updated 9 July 2026):

> "You’re welcome to use the GOV.UK patterns and frontend code even if your service is not considered part of GOV.UK."
>
> "While you can use the patterns, your site or service must not:
> identify itself as being part of GOV.UK
> use the crown or GOV.UK logotype in the header
> use the GDS Transport typeface
> suggest that it’s an official UK government website if it’s not
> use the GOV.UK brand colours"
>
> "If your service is not on GOV.UK, there’s no need to maintain that identity - in fact, you might confuse or mislead people if you do."
>
> "You should also use the brand logo and font of your organisation. The GOV.UK Design System includes a generic header component to help you do this."

Typeface (https://design-system.service.gov.uk/styles/typeface/):

> "If your service is on the service.gov.uk subdomain you must use the GDS Transport font."
>
> "If your service is publicly available on a subdomain other than service.gov.uk, use an alternative typeface."

Header (https://design-system.service.gov.uk/components/header/):

> "If your service is not hosted on one of the gov.uk domains outlined, you must not use the GOV.UK header component as it’s not considered part of GOV.UK."
>
> "Use the Generic header component instead to show your own organisation’s branding."
>
> "With these changes, the GOV.UK header and GOV.UK footer components should now only be used by services on the GOV.UK website. Services outside of the GOV.UK proposition should stop using the header and footer components and instead create their own."

Colour (https://design-system.service.gov.uk/styles/colour/):

> "Do not copy the specific hexadecimal (hex) colour values."

Using GOV.UK Frontend without GOV.UK branding (https://frontend.design-system.service.gov.uk/using-govuk-frontend-without-govuk-branding/):

> "This guidance is aimed at services that are: using GOV.UK patterns and frontend code; not part of the GOV.UK website"
>
> "To use GOV.UK Frontend without GOV.UK branding, you’ll need to: use the Generic header component; update your Sass to remove branded elements; use your own image assets; update your template theme-color value"

The GOV.UK footer carries the crown and "© Crown copyright" (https://design-system.service.gov.uk/components/footer/). Code licence (package README): "Unless stated otherwise, the codebase is released under the MIT License."

**What this means for us.**
- Patterns, specs and code are free to use (MIT).
- We use GOV.UK Frontend as-is, **including its palette** (green button, yellow focus, red error, greys).
- Ours, as GOV.UK requires:
  - the brand-blue group → Latarnia amber;
  - Atkinson instead of GDS Transport;
  - the "ul." plate in the Generic header, and our own footer.
- We never use:
  - the crown, the GOV.UK logotype or GDS Transport;
  - the GOV.UK header or footer, or "Crown copyright";
  - the brand-blue colours (including the default blue `govuk-tag` and the inverse button).
- We use colours through `govuk-colour()` / `govuk-functional-colour()`, never pasted hex: that's what the colour page's "Do not copy the specific hexadecimal (hex) colour values" asks.
- The existing footer line "Nie jesteśmy urzędem – obowiązuje harmonogram gminy" already does the "must not suggest it's official" job. Keep it.

## Palette (GOV.UK structure; the blue group replaced by Latarnia amber)

Source: [GOV.UK colour](https://design-system.service.gov.uk/styles/colour/) and `govuk-frontend` 6.5.1 [`settings/_colours-palette--internal.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_colours-palette--internal.scss).

**Method:** GOV.UK's steps are the primary colour mixed with white (tints) or black (shades) at fixed percentages. Checked: mixing `#1d70b8` this way reproduces GOV.UK's blue group exactly. The Latarnia group applies the same percentages to our accent `#9a5700`, and has a shade-10 like blue. The logo plate's amber `#ffb547` is unchanged and outside the palette.

| Group | primary | tint-25 | tint-50 | tint-80 | tint-95 | shade-10 | shade-25 | shade-50 |
|---|---|---|---|---|---|---|---|---|
| **latarnia** (replaces blue) | #9a5700 | #b38140 | #cdab80 | #ebddcc | #faf7f2 | #8b4e00 | #744100 | #4d2c00 |
| ~~blue~~ (not used) | #1d70b8 | #5694ca | #8eb8dc | #d2e2f1 | #f4f8fb | #1a65a6 | #16548a | #0f385c |
| green (kept) | #0f7a52 | #4b9b7d | #87bca8 | #cfe4dc | #f3f8f6 | | #0b5c3e | #083d29 |
| teal (kept) | #158187 | #50a1a5 | #8ac0c3 | #d0e6e7 | #f3f9f9 | | #106165 | #0b4144 |
| purple (kept) | #54319f | #7f65b7 | #aa98cf | #ddd6ec | #f6f5fa | | #3f2577 | #2a1950 |
| magenta (kept) | #ca357c | #d7689d | #e59abe | #f4d7e5 | #fcf5f8 | | #98285d | #651b3e |
| red (kept) | #ca3535 | #d76868 | #e59a9a | #f4d7d7 | #fcf5f5 | | #982828 | #651b1b |
| orange (kept) | #f47738 | #f7996a | #fabb9c | #fde4d7 | #fef8f5 | | #b7592a | #7a3c1c |
| yellow (kept) | #ffdd00 | #ffe640 | #ffee80 | #fff8cc | #fffdf2 | | #bfa600 | #806f00 |
| brown (kept) | #99704a | #b39477 | #ccb8a5 | | #faf8f6 | | | |
| black (kept) | #0b0c0c | #484949 | #858686 | #cecece | #f3f3f3 | | | |
| white (kept) | #ffffff | | | | | | | |

(Teal also has `accent` #00ffe0.)

### Functional colours

| Role | Value | Source |
|---|---|---|
| `text` | #0b0c0c | GOV.UK (black) |
| `secondary-text` | #484949 | GOV.UK (black tint-25) |
| `inverse-text` | #ffffff | GOV.UK (white) |
| `brand` | **#9a5700** | latarnia primary (was blue) |
| `link` | **#8b4e00** | latarnia shade-10 (was blue shade-10) |
| `link-hover` | **#4d2c00** | latarnia shade-50 (was blue shade-50) |
| `link-visited` | **#8b4e00** | latarnia shade-10, the link colour (D5) |
| `link-active` | #0b0c0c | GOV.UK (black) |
| `border` | #cecece | GOV.UK (black tint-80) |
| `input-border` | #0b0c0c | GOV.UK (black) |
| `template-background` | **#faf7f2** | latarnia tint-95 (was blue tint-95) |
| `body-background` | #ffffff | GOV.UK (white) |
| `focus` | #ffdd00 | GOV.UK (yellow) |
| `focus-text` | #0b0c0c | GOV.UK (black) |
| `error` | #ca3535 | GOV.UK (red) |
| `success` | #0f7a52 | GOV.UK (green) |
| `hover` | #cecece | GOV.UK (black tint-80) |
| `surface-background` | **#faf7f2** | latarnia tint-95 (was blue tint-95) |
| `surface-text` | #0b0c0c | GOV.UK (black) |
| `surface-border` | **#cdab80** | latarnia tint-50 (was blue tint-50) |

**Visited links have no colour of their own** (D5): `link-visited` is set to the link colour in `web/app/_settings.scss`, so a visited link looks like any other link.

### Contrast of every functional pair

These ratios use the WCAG 2.x formula of `design/contrast.mjs`. They are **all new pairs**: the palette changed, so PR 1 replaces the script's palette with this one and CI enforces it. Text needs 4.5 : 1 and UI components 3 : 1.

| Pair | Ratio | Result |
|---|---:|---|
| text on body-background | 19.59 | AAA |
| text on template-background | 18.33 | AAA |
| secondary-text on body-background | 9.03 | AAA |
| inverse-text on brand | 5.62 | AA |
| link on body-background | 6.59 | AA |
| link on surface-background | 6.17 | AA |
| link-hover on body-background | 12.53 | AAA |
| link-active on body-background | 19.59 | AAA |
| input-border vs body-background | 19.59 | UI pass |
| focus-text on focus | 14.55 | AAA |
| focus vs text (the dark edge pairs with the yellow) | 14.55 | UI pass |
| focus vs body-background | 1.35 | by design: the black `focus-text` edge carries the contrast, as on GOV.UK |
| error on body-background | 5.16 | AA |
| success on body-background | 5.35 | AA |
| button text (white) on button (green) | 5.35 | AA |
| button text on button hover (green shade-25) | 8.03 | AAA |
| warning button text on red | 5.16 | AA |
| secondary button text on black tint-95 | 17.65 | AAA |
| surface-text on surface-background | 18.33 | AAA |
| surface-border vs surface-background | 2.02 | decorative (GOV.UK's blue tint-50 is too); never the only cue |
| border vs body-background | 1.57 | decorative divider (GOV.UK default); never the only cue |
| brand vs body-background | 5.62 | UI pass |
| Generic header text on black | 19.59 | AAA |
| logo plate amber #ffb547 on the black header | 11.15 | UI pass |

## Audit table

States: **C** compliant, **P** partial, **M** missing, **N/A**. "Change" means using the named GOV.UK class or markup exactly, with the palette above. Effort: S < ½ day, M ≈ 1 day, L > 1 day. Perf deltas are gzip.

### Styles
| GOV.UK item | Now | Change | Effort | Perf |
|---|---|---|---|---|
| [Page template](https://design-system.service.gov.uk/styles/page-template/) | **P**: header, main and footer, `lang="pl"`; no skip link | `govuk-template` on `<html>`, `govuk-template__body` on `<body>`, skip link, Generic header, `govuk-width-container` > `govuk-main-wrapper` (`id="main-content"`), our footer | M | +core CSS (in the 7.7 KB); no JS |
| [Layout: width container](https://design-system.service.gov.uk/styles/layout/) ([`S/helpers/_width-container.scss#L23-L72`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_width-container.scss#L23-L72)) | **M**: `max-w-2xl` (672 px), gutters 16 / 32 | `govuk-width-container`: 960 px max, gutters 15 / 30 px with safe-area insets | S | in 7.7 KB |
| [Layout: grid](https://design-system.service.gov.uk/styles/layout/) | **M** | `govuk-grid-row` > `govuk-grid-column-two-thirds` for text pages (≤ 75 characters per line) | S | in 7.7 KB |
| [Layout: main wrapper](https://design-system.service.gov.uk/styles/layout/) ([`S/objects/_main-wrapper.mixin.scss#L26-L53`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_main-wrapper.mixin.scss#L26-L53)) | **M**: `mt-8` / `md:mt-14` on each `h1` | `govuk-main-wrapper` (20 / 40 px), `--l` where nothing precedes it | S | 0 |
| Breakpoints ([`S/settings/_media-queries.scss#L11-L13`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_media-queries.scss#L11-L13)) | **P**: Tailwind 640 / 768 | GOV.UK 320 / 641 / 769 via `govuk-media-query()` | S | 0 |
| [Type scale](https://design-system.service.gov.uk/styles/type-scale/) ([`S/settings/_typography-responsive.scss#L17-L138`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_typography-responsive.scss#L17-L138)) | **P**: body 18 / 27.9, h1 36→48, h2 22 | `govuk-body` (19 / 25), `govuk-heading-xl/l/m/s`, `govuk-caption-*`, `govuk-body-s`; CLAUDE.md updated | M | 0; `check-fonts` guards CLS |
| [Paragraphs](https://design-system.service.gov.uk/styles/paragraphs/), [headings](https://design-system.service.gov.uk/styles/headings/) | **P**: ad hoc `mt-*` | the GOV.UK classes' own margins | M | 0 |
| [Spacing](https://design-system.service.gov.uk/styles/spacing/) ([`S/settings/_spacing.scss#L11-L76`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_spacing.scss#L11-L76)) | **P**: 4 px rhythm | `govuk-!-margin-*` / `govuk-!-padding-*` overrides and `govuk-spacing()` in `app-*` Sass | M | spacing overrides +~1 KB if imported whole; import only the used ones |
| [Focus: links](https://design-system.service.gov.uk/get-started/focus-states/) ([`S/helpers/_focused.scss#L20-L47`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L20-L47)) | **M** | `govuk-link` (`:focus` → `govuk-focused-text`) | S | in 7.7 KB |
| [Focus: inputs](https://design-system.service.gov.uk/get-started/focus-states/) ([`#L83-L94`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L83-L94)) | **P** | `govuk-input` (`govuk-focused-form-input`) | S | in 7.7 KB |
| Focus: other boxes ([`#L64-L69`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L64-L69)) | **M** | The "more dates" disclosure becomes `govuk-details` (its own focus); the `site.scss` suggestion rows use `govuk-focused-text` | S | ~0.1 KB |
| [Links](https://design-system.service.gov.uk/styles/links/) ([`S/helpers/_links.scss#L86-L104`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_links.scss#L86-L104)) | **P**: text colour, 2 px, `.2em`, no states | `govuk-link`: 1 px (`max(1px, .0625rem)`), offset `.1578em`, hover `max(3px, .1875rem, .12em)`, link / visited / hover / active colours | S | in 7.7 KB |
| Links: same tab | **C** (task 16) | none | n/a | n/a |
| Theme | **M** (for GOV.UK): dark default with a toggle | Light only: remove the dark tokens, the toggle and the theme script (PR 1) | S | JS −toggle; CSS −dark blocks |
| Own CSS | **M** (for GOV.UK): Tailwind utilities everywhere | GOV.UK classes only; `site.scss` for the logo, bin markers and suggestions; `check-own-css` in CI; Tailwind deleted in PR 8 | L (spread over PRs 1–8) | CSS 4.9 → ~8.7 KB gzip |

### Forms
| GOV.UK item | Now | Change | Effort | Perf |
|---|---|---|---|---|
| [Text input](https://design-system.service.gov.uk/components/text-input/) | **P** | `govuk-form-group` > `govuk-label` + `govuk-hint` + `govuk-input`; house number `govuk-input--width-5` | S | in 7.7 KB |
| Text input: placeholder | **M**: "np. Słowackiego" | Remove it (the hint has examples) | S | −30 B HTML |
| [Label](https://design-system.service.gov.uk/components/text-input/), [hint](https://design-system.service.gov.uk/components/text-input/) | **P** | `govuk-label govuk-label--m` for the questions (or `govuk-label-wrapper` + `--l` when the question is the page heading); `govuk-hint` | S | 0 |
| [Error message](https://design-system.service.gov.uk/components/error-message/) | **M** | `<p class="govuk-error-message" id="nr-error"><span class="govuk-visually-hidden">Błąd:</span> …</p>`; `govuk-input--error`; `aria-describedby="nr-hint nr-error"` | M | error pages only |
| [Error summary](https://design-system.service.gov.uk/components/error-summary/) | **M** | GOV.UK markup: `govuk-error-summary` > `div[role=alert]` > `h2.govuk-error-summary__title` "Jest problem" + `ul.govuk-list.govuk-error-summary__list` with `#nr` links; focused on load without JS (`autofocus` + `tabindex="-1"`) | M | 0 JS |
| [Validation pattern](https://design-system.service.gov.uk/patterns/validation/) | **M** | Server side (GET form):<br>empty → „Wpisz numer domu, na przykład 12 albo 12a";<br>unknown → „Nie mamy numeru 42 w harmonogramie tej ulicy. Sprawdź numer albo harmonogram gminy";<br>"Błąd: " title prefix; `novalidate` | M | 0 |
| [Form group, error](https://design-system.service.gov.uk/components/error-message/) ([`S/objects/_form-group.mixin.scss#L14-L17`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_form-group.mixin.scss#L14-L17)) | **M** | `govuk-form-group--error` | S | 0 |
| Radios / checkboxes | **N/A**: none (the theme toggle is removed) | none | n/a | n/a |
| Search with suggestions | **P**: an ARIA 1.2 combobox (`check-search`); GOV.UK has no autocomplete component in the Design System (services use alphagov's accessible-autocomplete separately) | Keep the behaviour. The input becomes `govuk-input` (the search icon goes: GOV.UK inputs have none). The suggestion list is `app-suggestions`, with the highlighted row in the GOV.UK focus colours (`focus` fill, `focus-text`) | S | ~0; `check-search` guards layout shift |
| Search: submit button | **P**: none; Enter picks the match | Keep (suggestions are the action). Revisit with research | n/a | n/a |

### Buttons
| GOV.UK item | Now | Change | Effort | Perf |
|---|---|---|---|---|
| [Button](https://design-system.service.gov.uk/components/button/) | **P** | `govuk-button` on "Pokaż odbiory" (`<button>`) and "Dodaj do kalendarza" (`<a class="govuk-button" role="button" draggable="false">`, as GOV.UK's link-button markup, without the Space-key JS) | S | in 7.7 KB |
| Secondary / warning | **N/A** now | Available via `govuk-button--secondary` / `--warning` (GOV.UK colours); unused until needed | S | in 7.7 KB |
| Start button | **N/A**: no start page | none | n/a | n/a |
| Disabled | **C**: none used | Follow GOV.UK: avoid | n/a | 0 |

**Later** (not audited now; details, summary list, inset text and tag are planned for the pickup display in PR 6): back link, breadcrumbs, warning text, notification banner, panel, table, accordion, tabs, fieldset, date input, select, textarea, character count, file upload, cookie banner, phase banner, service navigation, and the patterns other than validation.

## Spec reference: forms and buttons (GOV.UK values we now take as-is)

The target is the GOV.UK value in every row; only colours are mapped (table above). Kept for review and visual QA.

| # | Property | GOV.UK value (source) | Ours now |
|---|---|---|---|
| I1 | Input font | 19 px / 25 px ([`input/_mixin.scss#L6`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L6)) | 22 px / 1.3 |
| I2 | Input height | 40 px ([`#L10`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L10)) | 56 px |
| I3 | Input padding | 5 px ([`#L12`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L12)) | 16 px (48 px left on the search) |
| I4 | Input border | 2 px `input-border` ([`#L17-L19`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L17-L19)) | 2 px `border` grey |
| I5 | Input radius | 0 ([`#L18`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L18)) | 4 px |
| I6 | Input focus | `outline: 3px solid focus; outline-offset: 0; box-shadow: inset 0 0 0 2px input-border` on `:focus` ([`_focused.scss#L83-L94`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L83-L94)) | border → focus colour + ring at 3 px offset |
| I7 | Input error | `border-color: error`; `input-border` on focus ([`#L46-L52`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L46-L52)) | none |
| I8 | Input widths | fluid 100 %; `--width-30/20/10/5/4/3/2` = 29.5 / 20.5 / 11.5 / 5.5 / 4.5 / 3.75 / 2.75 em ([`#L62-L88`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L62-L88)) | full width; 128 px |
| L1 | Label | 19 px; `--s` bold; `--m` 21→24 bold, 15 px below ([`label/_mixin.scss#L6-L35`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/label/_mixin.scss#L6-L35)) | 22 px bold, 8 px below |
| L2 | Hint | 19 px `secondary-text`, 15 px below; 10 px after a small label ([`hint/_mixin.scss#L6-L24`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/hint/_mixin.scss#L6-L24)) | 18 px, 8 px |
| L3 | Error message | 19 px bold `error`, 15 px below, hidden prefix ([`error-message/_mixin.scss#L6-L13`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-message/_mixin.scss#L6-L13), [`template.njk#L9`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-message/template.njk#L9)) | none |
| L4 | Form group | 20→30 px below; error: 15 px padding + 5 px `error` bar ([`_form-group.mixin.scss#L5-L24`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_form-group.mixin.scss#L5-L24)) | none |
| E1 | Error summary | 5 px `error` border, padding 15→20, margin 30→50, `:focus` 3 px outline; title 21→24 bold; bold error links ([`error-summary/_mixin.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/_mixin.scss#L5-L56)) | none |
| E2 | Error summary behaviour | `role="alert"` inner div ([`template.njk#L7-L9`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/template.njk#L7-L9)); focus on init ([`error-summary.mjs#L20-L26`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/error-summary.mjs#L20-L26)); link click focuses the input ([`#L85-L88`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/error-summary.mjs#L85-L88)) | none |
| B1 | Button font | 19 px, line height 1, regular ([`button/_mixin.scss#L38`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L38)) | 22 px bold |
| B2 | Button padding | 8 / 10 / 7 px ([`#L48-L49`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L48-L49)), so 38 px + 2 px shadow = 40 px | 56 px tall |
| B3 | Button border / radius | 2 px transparent / 0 ([`#L50-L51`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L50-L51)) | none / 4 px |
| B4 | Button shadow | `0 2px 0` shadow colour ([`#L54`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L54)) | none |
| B5 | Button width / margin | 100 % → auto from 641 px; bottom 22→32 px ([`#L43-L61`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L43-L61)) | auto |
| B6 | Hover / active | hover fill; active `top: 2px`, `::before` keeps the hit area ([`#L79-L129`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L79-L129)) | none |
| B7 | Button focus | `:focus` border + inset 1 px focus; not hovered or active: fill `focus`, text `focus-text`, `0 2px 0 focus-text` ([`#L88-L99`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L88-L99)) | generic ring |
| B8 | Disabled | opacity .5, no hover or press ([`#L132-L144`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L132-L144)) | n/a |
| B9 | Variants | secondary, warning, inverse, start ([`#L146-L231`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L146-L231)) | none |

## Deviations (what GOV.UK forbids us to copy, language, and visited links)
| # | What is ours | Why |
|---|---|---|
| D1 | The brand-blue group → the Latarnia amber group (brand, link, link hover, template/surface background, surface border); everything else is GOV.UK's palette | Service Manual: a site not on GOV.UK "must not … use the GOV.UK brand colours". (The colour page's "Do not copy the specific hexadecimal (hex) colour values" is coding guidance: use the Sass functions. We do.) |
| D2 | Atkinson Hyperlegible Next, self-hosted | Typeface: off service.gov.uk, "use an alternative typeface"; Service Manual: "must not … use the GDS Transport typeface" |
| D3 | Our "ul." plate in the GOV.UK **Generic header**; our own footer; no crown, GOV.UK logotype, GOV.UK header or footer | Header: "you must not use the GOV.UK header component … Use the Generic header component instead"; "Services outside of the GOV.UK proposition should stop using the header and footer components and instead create their own" |
| D4 | Polish copy (e.g. „Błąd:", „Jest problem") | Our users; GOV.UK says the error prefix can be changed for another language |
| D5 | No visited-link colour: `link-visited` = `link` (Latarnia shade-10), through the documented `$govuk-functional-colours` setting | Jakub's decision. GOV.UK's own option for links whose visited state does not help users ("links without a visited state", `govuk-link--no-visited-state`), applied site-wide by configuration rather than per-link classes |

Light only is not a deviation: GOV.UK is light only. Any further deviation needs Jakub's approval.

## Own CSS: `web/app/site.scss` only

**Allowed:** only what GOV.UK has no equivalent for, written with GOV.UK Sass functions and mixins (`govuk-spacing()`, `govuk-colour()` / `govuk-functional-colour()`, `govuk-font()`, `govuk-media-query()`, `govuk-focused-*`). No raw hex, no px.
1. **Logo:** the "ul." plate inside `govuk-generic-header__homepage-link` (size and alignment).
2. **Bin markers:** the waste-colour markers next to each fraction. The bin colours are real-world colours, so they're the only colours defined outside the GOV.UK palette (as Sass variables in this file).
3. **Search suggestions:** the dropdown list under the `govuk-input`, with the highlighted row in the GOV.UK focus colours.

**Everything else uses GOV.UK:**
- **Pickups:** the next pickup is a `govuk-summary-list` (date → fractions) under a `govuk-heading-m`; fractions are text plus the bin marker.
- **More dates:** "Pokaż więcej terminów" is `govuk-details`.
- **Notes and the source line:** `govuk-inset-text` / `govuk-body-s`.
- **Status labels:** e.g. "Termin przesunięty" uses a coloured `govuk-tag` (never the default blue).
- **No `govuk-panel`:** GOV.UK reserves it for confirmation pages.

**New CI check `scripts/check-own-css.mjs`** (in PR 1, tightened as pages migrate). It fails on:
- `site.scss` over **80 lines** or its compiled CSS over **1 KB gzip** (`govuk-frontend` excluded);
- any other `.css` / `.scss` file under `web/` besides `app/site.scss` and the GOV.UK entry file;
- raw hex or `px` in `site.scss`;
- `govuk-tag` without a colour modifier;
- after the last migration PR, any Tailwind class (an allowlist: `govuk-*`, `govuk-!-*`, `app-*`, `js-*`) or any `tailwindcss` dependency.

## Implementation plan (one prompt per PR)
| # | PR | Scope | Risk |
|---|---|---|---|
| 1 | **GOV.UK Frontend foundation + light only** | Install `govuk-frontend` 6.5.1 (exact pin) and `sass`. Add the GOV.UK Sass entry with the palette and font settings. Remove dark mode: tokens, theme toggle, theme script, `colorScheme`; `contrast.mjs` on the new palette. Page template: `govuk-template`, skip link, Generic header with our logo (dark-background lockup on black), `govuk-width-container` + `govuk-main-wrapper`, our footer. `site.scss` with the logo rules. Rebuild the OG image for the new palette; favicon without the dark media query. Add `check-own-css` | Medium–high: every page's frame changes; fonts, perf, HTML and a11y checks; CSS budget watched |
| 2 | **Typography and spacing** | `govuk-heading-*`, `govuk-body*`, `govuk-caption-*`, `govuk-list`, the `govuk-!-` overrides, the two-thirds grid on text pages (`/dostepnosc`, `/prywatnosc`, 404); delete the replaced utilities | Medium: `check-fonts` (CLS) |
| 3 | **Links and focus** | `govuk-link` everywhere; GOV.UK focus via the components; `site.scss` parts use `govuk-focused-*` | Low |
| 4 | **Inputs, labels, hints, autocomplete** | `govuk-form-group`, `govuk-label`, `govuk-hint`, `govuk-input` (`--width-5` for the number); remove the placeholder and the search icon; the suggestion list moves into `site.scss` (our combobox kept) | Medium: `check-search` (layout shift) |
| 5 | **Buttons** | `govuk-button` for "Pokaż odbiory" and "Dodaj do kalendarza" | Low |
| 6 | **Pickup display** | Street page: `govuk-summary-list`, `govuk-details`, `govuk-inset-text`, `govuk-tag`; bin markers in `site.scss` | Medium: street HTML budget (≤ 30 KB gzip), fonts check |
| 7 | **Error summary and validation UI** | `govuk-error-summary`, `govuk-error-message`, `govuk-form-group--error`, `govuk-input--error`, "Błąd: " title, `novalidate`; focus via `autofocus`; a11y check with an error URL | Medium |
| 7b | **Validation server logic** | Empty and unknown house number → the error state from PR 7 (GET form, ISR rewrite for `?nr=`) | Medium |
| 8 | **Remove Tailwind** | Delete the dependencies, config, PostCSS and the remaining utilities; `check-own-css` switches on the Tailwind-class failure; final CSS budget check | Low–medium |
