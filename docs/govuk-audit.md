# GOV.UK Design System audit (phase 1: foundations, forms, buttons)

**Scope:** task 25, narrowed by Jakub on 2026-10-20. This covers:
- styles: layout, typography, spacing, focus, links;
- forms: text input, label, hint, error message, error summary, search;
- buttons.

Everything else is on one "later" line at the end.

**Reference:** GOV.UK Frontend **v6.5.1** (the newest release more than two weeks old). Values are measured from its Sass and JS source; `S/` below means `https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/`. The pages read are listed in [`govuk-audit-sources.md`](govuk-audit-sources.md).

**Checked against:**
- the code in `web/` (`app/globals.css`, `app/tokens.css`, `components/address-search.tsx`, `components/place-page.tsx`, `components/theme-switch.tsx`, the page files);
- the pages `/`, `/adres/0972447-00470`, `/dostepnosc`, `/prywatnosc` and the 404 page;
- the PDF, which has no forms, links or focus, so nothing there is in scope.

**Colours stay ours.** GOV.UK colour *roles* are mapped onto Latarnia tokens; no GOV.UK hex value is adopted.

## Summary

### Top 10 gaps
1. **Link focus:** a 3 px outline ring with 3 px offset (`globals.css`), not GOV.UK's focus fill plus dark 4 px underline. In the light theme the focus colour is dark brown (`#6b3d00`), so there is no light/dark pair at all.
2. **Input focus:** the border turns the focus colour and the global ring floats 3 px outside. GOV.UK uses a 3 px focus outline with offset 0, plus an inset 2 px input-border shadow (the border looks 4 px thick).
3. **Buttons:**
   - nothing GOV.UK-like: no 2 px bottom shadow, no hover colour, no pressed 2 px offset;
   - no focus state (focus fill, dark text, dark 2 px bottom edge);
   - 4 px corners instead of square.
4. **No error pattern at all:**
   - An unknown house number shows a bold note. There is no error summary, no "Błąd: " title prefix, no red bar, no error message and no error border.
   - An empty number has no message at all.
5. **Input styling:**
   - the border is the grey `border` token (4.25 : 1), not the input-border role (text colour);
   - 4 px radius instead of 0;
   - text 22 px instead of 19 px;
   - 16 px side padding instead of 5 px.
6. **Placeholder** "np. Słowackiego" on the street search repeats the hint. GOV.UK: "Do not use placeholder text in place of a label, or for hints or examples".
7. **Links:**
   - text-coloured with a fixed 2 px underline;
   - no hover state (GOV.UK thickens the underline to `max(3px, .1875rem, .12em)` and changes colour);
   - no link colour role;
   - offset `.2em` instead of `.1578em`.
8. **Label and hint:**
   - the label is 22 px bold;
   - spacing is a uniform 8 px. GOV.UK uses label → hint 5 px, hint → input 10 px, and 15 px under a hint with no label.
9. **Type scale:**
   - body is 18 px / 1.55, against 19 px / 25 px (1.316);
   - `h2` is a fixed 22 px, against 21 → 24 px (heading-m);
   - line heights are looser than GOV.UK's throughout.
10. **Spacing and layout:**
    - the 4 px Tailwind rhythm, not the 5 px GOV.UK scale, so no responsive steps;
    - main padding 32 / 56 px, not 20 / 40 px (main wrapper);
    - no skip link in the template.

### Recommendation: re-implement the specs on our Tailwind tokens
| | `govuk-frontend` (Sass + JS) | Specs on Latarnia tokens |
|---|---|---|
| CSS for foundations + forms + buttons | **36.3 KB raw, 5.35 KB gzip** (base, core, objects, button, input, error-summary, fieldset, radios, skip-link; Sass 1.105.1, compressed) | **4.0 KB raw, 1.27 KB gzip** (scratch prototype of the same rules) |
| Forms and buttons only | 13.0 KB raw, 2.67 KB gzip | (included above) |
| JS | **+2.54 KB gzip** first-load (Button + ErrorSummary, esbuild minified) → street page 141.2 → ~143.7 KB of 150 | **0 KB.** Error-summary focus via server-rendered `autofocus` + `tabindex="-1"`, to be verified in PR 5; fallback is a one-line client effect. No double-click guard needed: our forms are idempotent GET forms |
| Dark mode | Partial. v6 exposes functional colours as `--govuk-*-colour` variables, but the button styles compile **14 hard-coded hex values** (greens, reds, greys) that need per-theme overrides | Native: every value is a Latarnia variable with dark and light |
| Focus | `:focus`, so it also shows on mouse click | `:focus-visible`, keyboard only, as required |
| Font | Compiles a GDS Transport `@font-face` unless overridden; the typeface must not be used here | Atkinson is already wired |
| Tooling | New `sass` dependency. Two reset layers (Tailwind preflight + GOV.UK), px-based helpers | None new |
| Current CSS | 19.2 KB raw, **4.9 KB gzip** | → about 6.2 KB gzip (+1.3 KB) |
| Street HTML | 16.1 KB gzip of 30 | about the same; class names replace utility strings |
| CLS | none (the rules are static) | none (outline and box-shadow don't move layout) |

**Pick the token approach:**
- It gives near 1:1 visual fidelity at a quarter of the CSS and zero JS.
- Dark mode works natively.
- It follows the brief's `:focus-visible` rule.
- `govuk-frontend` would cost 2.5 KB of first-load JS and a second reset layer, and its branded parts (GDS Transport, button hex values) must be overridden anyway.

Every spec value below links to the line in the GOV.UK source, so fidelity can be checked line by line.

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
- We keep our own header and footer: the flat "ul." plate, conaulicy, the Latarnia palette and Atkinson Hyperlegible Next.
- We never use:
  - the crown, the GOV.UK logotype or GDS Transport;
  - the GOV.UK blue/black header, the GOV.UK footer or "Crown copyright";
  - GOV.UK hex values, including the button green and the focus yellow `#ffdd00`. We map the *roles*.
- The existing footer line "Nie jesteśmy urzędem – obowiązuje harmonogram gminy" already does the "must not suggest it's official" job. Keep it.

## Colour roles → Latarnia tokens

Existing ratios come from `node design/contrast.mjs` (table in `design/tokens.md`). Ratios marked * are **new pairs**, computed with the same formula as `contrast.mjs`; PR 1 adds them to the script, so CI enforces them.

| GOV.UK role | Latarnia token, dark | Latarnia token, light | Contrast (dark / light) |
|---|---|---|---|
| `text` | `text` #e9edf2 | `text` #161b24 | on background 15.67 / 16.09 |
| `secondary-text` | `text-muted` #b4bcc8 | `text-muted` #4a5568 | on background 9.62 / 7.01 |
| `focus` | `focus` #ffdda0 (unchanged) | **`focus` #ffdda0 (was #6b3d00)** | vs background 14.13 / 1.22*. In light, the dark ring carries 3 : 1, as GOV.UK's black ring does on white |
| `focus-text` | **new** `focus-text` #10141d | **new** `focus-text` #161b24 | on focus 14.13* / 13.24*. Ring vs background: 1.00* (yellow carries it) / 16.09 |
| `input-border` | **new** `input-border` = `text` | = `text` | vs surface 13.92* / 17.26* |
| `border` | `border` #6f7a8d | `border` #6f7a8d | vs background 4.25 / 4.04 |
| `link` | **new** `link` = `accent` #ffb547 | = `accent` #9a5700 | on background 10.49 / 5.24; on surface 9.32* / 5.62* |
| `link-hover`, `link-active` | `text` | `text` | 15.67 / 16.09 |
| `link-visited` | none: "links without a visited state" (a few, mostly navigation links) | none | n/a |
| `error` | `danger` #ff8f85 | `danger` #b42318 | on background 8.35 / 6.13; on surface 7.42 / 6.57 |
| `success` | `success` #6fd49a | `success` #1e7a46 | on background 10.14 / 4.98 |
| button (primary) | fill `accent`, text `accent-contrast` | fill `accent`, text `accent-contrast` | 10.49 / 5.62 |
| button hover | **new** `accent-hover` #bf8835 (25 % shade) | **new** `accent-hover` #744100 | text on it 5.96* / 8.40* |
| button shadow | **new** `accent-shadow` #805b24 (50 % shade) | **new** `accent-shadow` #4d2c00 | decorative edge; fill vs background 10.49 / 5.24 |
| secondary button | fill `secondary`, text `text`, shadow `border`, hover `surface-2` | same tokens | 11.63 / 14.56; hover 12.43 / 12.40* |
| warning button | fill `danger`, text `accent-contrast`, **new** `danger-hover` #bf6b64 / #871a12, **new** `danger-shadow` #804843 / #5a120c | | 8.35* / 6.57*; on hover 4.83* / 9.60* |

**Decision for Jakub:** is the link colour amber? It keeps one accent and passes AA, but the page gets warmer and busier. The alternative is GOV.UK's `govuk-link--text-colour` style (what we do now) and the `link` role stays `text`. The table and PR 3 assume amber.

## Audit table

States: **C** compliant, **P** partial, **M** missing, **N/A**. Effort: S < ½ day, M ≈ 1 day, L > 1 day. All perf deltas are gzip.

### Styles
| GOV.UK item | Now | Change needed | Effort | Perf |
|---|---|---|---|---|
| [Focus: links](https://design-system.service.gov.uk/get-started/focus-states/) ([`S/helpers/_focused.scss#L20-L47`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L20-L47)) | **M**: outline 3 px, offset 3 px, `--focus` | `a:focus-visible`: transparent 3 px outline (forced colours), `color: focus-text`, `background: focus`, `box-shadow: 0 -2px focus, 0 4px focus-text`, no underline, `box-decoration-break: clone` | S | +0.2 KB CSS; no CLS (shadow) |
| [Focus: boxes](https://design-system.service.gov.uk/get-started/focus-states/) ([`#L64-L69`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L64-L69)) | **M** | Theme switch, summary toggles and option rows: `box-shadow: 0 0 0 4px focus, 0 0 0 8px focus-text` with a transparent outline | S | +0.1 KB; no CLS |
| [Focus: form inputs](https://design-system.service.gov.uk/get-started/focus-states/) ([`#L83-L94`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L83-L94)) | **P**: border → focus colour plus a ring at 3 px offset | `outline: 3px solid focus; outline-offset: 0; box-shadow: inset 0 0 0 2px input-border`; the border stays `input-border` | S | ~0; no CLS |
| Focus: light-theme colour | **P**: dark brown `#6b3d00` | Pale amber `#ffdda0` plus the dark `focus-text` ring, as GOV.UK's yellow + black; add the pairs to `contrast.mjs` | S | 0 |
| `:focus` vs `:focus-visible` | `:focus-visible` everywhere | Keep it (brief). Text inputs match `:focus-visible` on click too, so inputs behave like GOV.UK. Deviation D5 | n/a | 0 |
| [Links](https://design-system.service.gov.uk/styles/links/) ([`S/settings/_links.scss#L19-L48`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_links.scss#L19-L48), [`S/helpers/_links.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_links.scss#L86-L104)) | **P**: underlined, but text colour, 2 px, offset .2em, no hover | Thickness `max(1px, .0625rem)`, offset `.1578em`; hover thickness `max(3px, .1875rem, .12em)` with `text-decoration-skip-ink: none`; colour `link` → hover/active `text`; no visited state | S | +0.1 KB; no CLS |
| Links: same tab | **C** (task 16) | none | n/a | n/a |
| [Type scale](https://design-system.service.gov.uk/styles/type-scale/) ([`S/settings/_typography-responsive.scss#L17-L138`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_typography-responsive.scss#L17-L138)) | **P**: body 18/27.9, h1 36→48, h2 22 | Body 19/25; `h1` heading-l 27/30→36/40, or xl for the home page 32/35→48/50; `h2` heading-m 21/25→24/30; `h3` heading-s 19/25; small 16/20. Changes the CLAUDE.md "body text 18px" rule (D6) | M | 0 bytes; CLS checked by `check-fonts` (fallback metrics are size-independent) |
| [Paragraphs](https://design-system.service.gov.uk/styles/paragraphs/), [headings](https://design-system.service.gov.uk/styles/headings/) ([`S/core/_typography.mixin.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/core/_typography.mixin.scss#L6-L60)) | **P**: ad-hoc `mt-*` per element | Heading bottom margins: xl 30→50, l 20→30, m and s 15→20; paragraphs 15→20 (responsive scale 8, 6, 4) | M | ~0 |
| [Spacing](https://design-system.service.gov.uk/styles/spacing/) ([`S/settings/_spacing.scss#L11-L76`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_spacing.scss#L11-L76)) | **P**: 4 px Tailwind rhythm | Add the static scale 0, 5, 10, 15, 20, 25, 30, 40, 50, 60 px and responsive tokens (4: 15→20, 5: 15→25, 6: 20→30, 7: 25→40, 8: 30→50, 9: 40→60 at 641 px) as Tailwind theme values; migrate page by page | M | +0.3 KB CSS |
| [Layout](https://design-system.service.gov.uk/styles/layout/): width container ([`S/helpers/_width-container.scss#L23-L72`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_width-container.scss#L23-L72)) | **P**: `max-w-2xl` (672 px), gutters 16 / 32 px | Gutters 15 / 30 px with `env(safe-area-inset-*)`. Keep a single two-thirds-like column (≈ 640 px, ≤ 75 characters); a 960 px container adds nothing on a one-column site (D7) | S | 0 |
| [Layout](https://design-system.service.gov.uk/styles/layout/): main wrapper ([`S/objects/_main-wrapper.mixin.scss#L26-L53`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_main-wrapper.mixin.scss#L26-L53)) | **P**: `mt-8` / `md:mt-14` (32 / 56) on each `h1` | `main` gets padding 20 / 40 px top and bottom, 30 / 50 px when nothing comes before it | S | 0 |
| Breakpoints ([`S/settings/_media-queries.scss#L11-L13`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_media-queries.scss#L11-L13)) | **C** in effect: Tailwind `sm` 640, `md` 768 vs GOV.UK 641 / 769 | Optionally set `--breakpoint-sm: 40.0625rem`, `--breakpoint-md: 48.0625rem` for exactness | S | 0 |
| [Page template](https://design-system.service.gov.uk/styles/page-template/) | **P**: header, main and footer present; no skip link; `lang="pl"` ✓ | Add the skip link ("Przejdź do treści") as the first focusable element. The component itself is in the "later" list, but it belongs to the template | S | +0.1 KB HTML |

### Forms
| GOV.UK item | Now | Change needed | Effort | Perf |
|---|---|---|---|---|
| [Text input](https://design-system.service.gov.uk/components/text-input/) | **P**: see the spec table | Spec table rows I1–I9 | S | ~0 |
| Text input: widths | **P**: house number `w-32` (128 px); street search full width | House number `width-5` (`max-width: 5.5em`); search fluid 100 % | S | 0 |
| Text input: no placeholder | **M**: "np. Słowackiego" | Remove it; the hint already gives examples | S | −30 B HTML |
| [Label](https://design-system.service.gov.uk/components/text-input/) / [hint](https://design-system.service.gov.uk/components/text-input/) | **P**: label 22 px bold, uniform 8 px gaps | Spec rows L1–L4 | S | 0 |
| [Error message](https://design-system.service.gov.uk/components/error-message/) | **M** | `<p class="error-message" id="nr-error"><span class="sr-only">Błąd:</span> …</p>` between hint and input; the input gets `aria-describedby="nr-hint nr-error"` and the error class | M | +0.1 KB HTML on error pages only |
| [Error summary](https://design-system.service.gov.uk/components/error-summary/) | **M** | At the top of `main`: `div[tabindex=-1]` with `role="alert"` inside, title "Jest problem", a list of links to `#nr`, focused on load; same wording as the field message | M | +0.3 KB HTML on error pages; 0 JS (see the recommendation) |
| [Validation pattern](https://design-system.service.gov.uk/patterns/validation/) | **M** | Server-side only (GET form): empty → "Wpisz numer domu, na przykład 12 albo 12a"; unknown → "Nie mamy numeru 42 w harmonogramie tej ulicy. Sprawdź numer albo harmonogram gminy". `<title>` starts with "Błąd: "; `novalidate` on forms | M | 0 |
| Form group ([`S/objects/_form-group.mixin.scss#L5-L24`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_form-group.mixin.scss#L5-L24)) | **M** | Wrapper with bottom margin 20 / 30; error modifier with a 5 px `danger` left bar and 15 px padding | S | ~0 |
| Radios / checkboxes | **N/A**: none on the site (the theme switch is a cycling button) | none | n/a | n/a |
| Search with suggestions (autocomplete) | **P**: an ARIA 1.2 combobox, tested by `check-search`; there is no GOV.UK Design System autocomplete component (GOV.UK services use alphagov's accessible-autocomplete separately) | Keep the behaviour. Restyle the input to the text-input spec; option rows keep the 48 px minimum; the highlighted row gets the box focus colours (`focus` fill, `focus-text`) instead of `surface-2` + amber bar | S | ~0; `check-search` guards layout shift |
| Search: submit control | **P**: no visible button; Enter picks the single or highlighted match | Keep it (one thing per page, and suggestions are the action). Revisit if research shows people look for a button | n/a | n/a |

### Buttons
| GOV.UK item | Now | Change needed | Effort | Perf |
|---|---|---|---|---|
| [Default button](https://design-system.service.gov.uk/components/button/) | **P**: amber fill, but 4 px radius, no shadow, no hover/active, generic focus ring | Spec rows B1–B11 on "Pokaż odbiory" and "Dodaj do kalendarza". The latter stays a real link styled as a button. GOV.UK adds `role="button"` + `draggable="false"` + Space handling (JS) to such links; we skip them because it navigates to a file, and a link is the honest role | S | +0.4 KB CSS |
| Secondary button | **N/A** now | Define the style (tokens above) for later; don't use it until a page needs two actions | S | in the +0.4 KB |
| Warning button | **N/A**: nothing destructive on the site | Define only. GOV.UK: "Most services should not need one" | S | in the +0.4 KB |
| Start button | **N/A**: the home page is the service (search), not a start page | none | n/a | n/a |
| Disabled buttons | **C**: none used | Document "avoid", as GOV.UK does: "Disabled buttons have poor contrast and can confuse some users, so avoid them if possible" | S | 0 |
| Double-click prevention | **N/A**: GET forms are safe to repeat | none | n/a | n/a |

**Later** (not audited in this phase): skip link (as a component), back link, breadcrumbs, details, inset text, warning text, notification banner, panel, summary list, table, tag, accordion, tabs, fieldset, date input, select, textarea, character count, file upload, cookie banner, phase banner, service navigation, footer, generic header, and the patterns other than validation (question pages, check answers, confirmation, cookies, contact details, addresses, …).

## Precise spec: forms and buttons

`GOV.UK` values are from v6.5.1; px at the 16 px root (v6 outputs rem). The colours in the "proposed" column are Latarnia roles (see the mapping above). Each row is one property.

### Text input
| # | Property | GOV.UK value (source) | Ours now | Proposed |
|---|---|---|---|---|
| I1 | Font size / line height | 19 px / 25 px, all sizes ([`input/_mixin.scss#L6`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L6), [`_typography-responsive.scss#L116`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_typography-responsive.scss#L116)) | 22 px / 1.3 (`text-lg`) | 19 px (1.1875rem) / 25 px |
| I2 | Height | 40 px, `govuk-px-to-rem(40px)` ([`#L10`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L10)) | `min-h-14` = 56 px | **48 px** (3rem): deviation D8, our 48 px tap-target rule. Otherwise 40 px |
| I3 | Padding | 5 px all round, `govuk-spacing(1)` ([`#L12`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L12)) | 16 px sides (48 px left on search for the icon) | 5 px; the search keeps its left inset for the icon (`pl-10`) |
| I4 | Border | 2 px solid `input-border` ([`#L17-L19`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L17-L19), [`_measurements.scss#L76`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_measurements.scss#L76)) | 2 px `border` (#6f7a8d) | 2 px `input-border` (= `text`) |
| I5 | Radius | 0 ([`#L18`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L18)) | 4 px (`rounded-sm`) | 0 |
| I6 | Background | not set (the page's white) | `surface` | `surface` (dark `#19202b` gives the field a visible well; light `#ffffff` = GOV.UK) |
| I7 | Focus | `outline: 3px solid focus; outline-offset: 0; box-shadow: inset 0 0 0 2px input-border` ([`_focused.scss#L83-L94`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/helpers/_focused.scss#L83-L94)) | border → `focus` + 3 px ring at 3 px offset | Same as GOV.UK on `:focus-visible` |
| I8 | Error | `border-color: error`; on focus back to `input-border` ([`#L46-L52`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L46-L52)) | none | `danger`; `input-border` on focus |
| I9 | Widths | Fluid 100 %; fixed `--width-30/20/10/5/4/3/2` = max-width 29.5 / 20.5 / 11.5 / 5.5 / 4.5 / 3.75 / 2.75 em ([`#L62-L88`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L62-L88)) | search full width; number 128 px | search fluid; number `--width-5` (5.5em) |
| I10 | Disabled | opacity .5, `cursor: not-allowed` ([`#L28-L33`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/input/_mixin.scss#L28-L33)) | n/a | same, if ever used |

### Label, hint, error message, form group, error summary
| # | Property | GOV.UK value (source) | Ours now | Proposed |
|---|---|---|---|---|
| L1 | Label size | 19 px regular; `--s` 19 bold; `--m` 21→24 bold; `--l` 27→36; `--xl` 32→48 ([`label/_mixin.scss#L6-L35`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/label/_mixin.scss#L6-L35)) | 22 px bold | Question labels `--m` (21→24 bold); the search label `--m` |
| L2 | Label → next | 5 px; 15 px for `--m/--l/--xl` ([`#L10`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/label/_mixin.scss#L10), [`#L19`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/label/_mixin.scss#L19)) | 8 px (`gap-2`) | 15 px under `--m` |
| L3 | Hint | 19 px, `secondary-text`; 15 px below; 10 px when after a small label ([`hint/_mixin.scss#L6-L24`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/hint/_mixin.scss#L6-L24)) | 18 px `text-muted`, 8 px below (+4 px `mt-1` on the input) | 19 px `text-muted`, 15 px below |
| L4 | Error message | 19 px **bold**, `error`, 15 px below, hidden "Error:" prefix ([`error-message/_mixin.scss#L6-L13`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-message/_mixin.scss#L6-L13), [`template.njk#L9`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-message/template.njk#L9)) | none | 19 px bold `danger`, 15 px below, `<span class="sr-only">Błąd:</span>` |
| L5 | Form group | bottom margin 20→30 ([`_form-group.mixin.scss#L7`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_form-group.mixin.scss#L7)) | none (`gap-2` stack) | 20→30 |
| L6 | Form group, error | `padding-left: 15px; border-left: 5px solid error` ([`#L14-L17`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/objects/_form-group.mixin.scss#L14-L17)) | none | same, `danger` |
| E1 | Summary box | 5 px `error` border; padding 15→20; bottom margin 30→50; 19 px text ([`error-summary/_mixin.scss#L5-L12`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/_mixin.scss#L5-L12)) | none | same, `danger` |
| E2 | Summary focus | `outline: 3px solid focus` ([`#L14-L17`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/_mixin.scss#L14-L17)) | none | same |
| E3 | Summary title | 21→24 px bold, 15→20 below ([`#L20-L26`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/_mixin.scss#L20-L26)); wording "There is a problem" | none | "Jest problem" |
| E4 | Summary links | bold, error colour, link focus style ([`#L52-L56`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/_mixin.scss#L52-L56)) | none | bold `danger`, link focus |
| E5 | Summary semantics | `role="alert"` on an inner `div` ([`template.njk#L7-L9`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/template.njk#L7-L9)); focused on init ([`error-summary.mjs#L20-L26`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/error-summary.mjs#L20-L26)); a link click scrolls the label into view and focuses the input ([`#L85-L88`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/error-summary/error-summary.mjs#L85-L88)) | none | Same markup; focus via `autofocus` + `tabindex="-1"`; links `href="#nr"` (native jump; the label sits right above the input, so it stays in view) |
| E6 | Page title | "Error: " prefix ([validation pattern](https://design-system.service.gov.uk/patterns/validation/)) | none | "Błąd: " prefix |

### Buttons
| # | Property | GOV.UK value (source: [`button/_mixin.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss)) | Ours now | Proposed |
|---|---|---|---|---|
| B1 | Font | 19 px, line height 19 px (1), **regular** weight ([`#L38`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L38)) | 22 px bold | 19 px regular, line height 1 |
| B2 | Padding | 8 / 10 / 7 px, top / sides / bottom (= `spacing(2)` − 2 border − 1 half-shadow) ([`#L48-L49`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L48-L49)) | 0 / 20 px, centred in 56 px | 12 / 10 / 11 px to reach 48 px including the shadow (D8); otherwise exact |
| B3 | Border / radius | 2 px transparent / 0 ([`#L50-L51`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L50-L51)) | none / 4 px | 2 px transparent / 0 |
| B4 | Bottom shadow | `0 2px 0 shadow-colour` ([`#L35`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L35), [`#L54`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L54)) | none | `0 2px 0 var(--accent-shadow)` |
| B5 | Width | 100 % on mobile, `auto` from 641 px ([`#L43`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L43), [`#L61`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L61)) | auto | same |
| B6 | Bottom margin | 22→32 px (responsive 6 + shadow) ([`#L47`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L47)) | ad hoc | same |
| B7 | Hover | darker fill (shade 25 %) ([`#L79-L81`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L79-L81)) | none | `accent-hover` |
| B8 | Active (pressed) | `top: 2px` (moves down onto its shadow); `::before` keeps the hit area ([`#L83-L86`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L83-L86), [`#L103-L129`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L103-L129)) | none | same (`position: relative`, so no layout shift) |
| B9 | Focus | `border-color: focus`, transparent 3 px outline, `inset 0 0 0 1px focus`; when not hovered or active: fill `focus`, text `focus-text`, `box-shadow: 0 2px 0 focus-text` ([`#L88-L99`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L88-L99)) | generic ring | same on `:focus-visible` |
| B10 | Disabled | opacity .5; no hover; no press ([`#L132-L144`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L132-L144)) | n/a | same; avoid using it |
| B11 | Variants | secondary: grey fill, black text, grey shadow ([`#L146-L165`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L146-L165)); warning: red fill, white text ([`#L167-L186`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L167-L186)); start: 24 px bold, `inline-flex`, arrow icon with 5→10 px gap ([`#L209-L231`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/_mixin.scss#L209-L231)) | none | secondary and warning with the tokens above; no start button |
| B12 | Behaviour | Space activates a link-button; optional double-click guard of 1 s ([`button.mjs#L3`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/button.mjs#L3), [`#L45`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/components/button/button.mjs#L45)) | n/a | Real `<button>` for actions; "Dodaj do kalendarza" stays a link (it navigates to a file), so no Space handler and no JS |

## Deliberate deviations
| # | Deviation | Why |
|---|---|---|
| D1 | Our flat "ul." logo and the Latarnia palette; no crown, no GOV.UK logotype, no GOV.UK blue/black header or footer | Required: the Service Manual says a site not on GOV.UK "must not … use the crown or GOV.UK logotype … use the GOV.UK brand colours" |
| D2 | Atkinson Hyperlegible Next, self-hosted | Required: "use an alternative typeface" off service.gov.uk. It's also designed for low-vision readers |
| D3 | Dark theme by default, with a toggle | Latarnia identity; many evening and older users. GOV.UK has no dark mode, so every role is mapped in both themes and checked by `contrast.mjs` |
| D4 | Polish | Our users. GOV.UK says the error prefix can be translated ("Błąd:"); summary title "Jest problem" |
| D5 | `:focus-visible` instead of `:focus` | The brief: keyboard-only focus. Inputs behave the same, since text inputs always match `:focus-visible` |
| D6 | Body text 19 px (CLAUDE.md says 18 px) | Follows GOV.UK; needs Jakub's OK and a CLAUDE.md update in the same PR |
| D7 | One ≈ 640 px column instead of the 960 px container + two-thirds grid | The site has no sidebar; the column already gives GOV.UK's reading width |
| D8 | Inputs and buttons 48 px tall (GOV.UK 40 px) | CLAUDE.md's 48 px tap-target rule. Only the height differs; borders, shadow, focus and type follow the spec |
| D9 | No visited link colour | GOV.UK's own "links without a visited state" option; our links are mostly navigation |

## Implementation plan (one prompt per PR)
| # | PR | Scope | Risk |
|---|---|---|---|
| 1 | **Tokens and contrast** | Add the roles to `design/tokens.css` and `web/app/tokens.css`: `focus` light #ffdda0, `focus-text`, `input-border`, `link`, `accent-hover/shadow`, `danger-hover/shadow`. Add the new pairs to `contrast.mjs` and `tokens.md`; GOV.UK spacing scale as Tailwind theme values. No visual change except the light focus colour | Low |
| 2 | **Focus states** | Link text-focus, box focus (theme switch, `summary`, option rows), input focus, button focus, all `:focus-visible`; screenshot each in both themes | Low; no CLS (outline and shadow) |
| 3 | **Links** | Underline thickness and offset, hover thickening, `link` colour, no visited state | Low, but very visible: decide the amber links first |
| 4 | **Text input, label and hint** | Spec rows I1–I10 and L1–L3 on the search and the house number; remove the placeholder; fixed width for the number | Medium: `check-search` (layout shift) and `check-fonts` guard it |
| 5 | **Validation pattern** | House number: empty and unknown → error summary + "Błąd: " title + form-group bar + error message + error border; `novalidate`; rows L4–L6 and E1–E6; extend the a11y check with an error URL | Medium: server logic and ISR rewrite for `?nr=` |
| 6 | **Buttons** | Rows B1–B12 on "Pokaż odbiory" and "Dodaj do kalendarza"; define secondary and warning; note the disabled guidance in `docs/brand.md` | Low |
| 7 | **Type scale, spacing, template** | Body 19 / 25 (with a CLAUDE.md update), heading scale and margins, `main` padding, gutters, breakpoints, skip link | Medium–high: touches every page; do last, with the fonts and perf checks |
