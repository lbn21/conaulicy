# conaulicy.pl brand

The logo is the flat **“ul.” plate** (option A “Tabliczka”, refined in task 22). The site follows **GOV.UK Frontend as-is, including its palette; only the brand-blue roles, the typeface and the logo are ours** (decision of 2026-10-20, see [`docs/govuk-audit.md`](govuk-audit.md)). The site is **light only**. Sources and generators are in [`docs/logo/`](logo/), and the geometry and centring are explained in [`docs/logo/README.md`](logo/README.md).

## Logo variants

| Variant | File | Use |
|---|---|---|
| **Plate + wordmark, light** (primary) | [`a-logo-light.svg`](logo/a-logo-light.svg) | Anywhere on a light background: pages, print, share images |
| **Plate + wordmark, on dark** | [`a-logo-dark.svg`](logo/a-logo-dark.svg) | Only on a dark bar: the site header is the GOV.UK **Generic header**, whose default bar is black, so it uses this lockup. Otherwise archive/backlog, since the site has no dark theme |
| **Plate only** | [`a-mark-light.svg`](logo/a-mark-light.svg) (primary), [`a-mark-dark.svg`](logo/a-mark-dark.svg) (archive) | Where the name is right beside it (OG card) or space is square |
| **Mono** | [`a-logo-mono.svg`](logo/a-logo-mono.svg), [`a-mark-mono.svg`](logo/a-mark-mono.svg) | One colour, `currentColor`: stamps, single-colour print, embossing |
| **Favicons** | [`a-favicon.svg`](logo/a-favicon.svg) (32 px), [`a-favicon-16.svg`](logo/a-favicon-16.svg) (16 px) | Browser tab, app icons. Separate pixel-snapped drawings, not scaled logos |

“ul.” and the rim are **cut out** of the plate (an SVG mask), so the background shows through them.

**Header:**
- The GOV.UK **Generic header** pattern (`govuk-generic-header`) with our logo in `govuk-generic-header__homepage-link`. Never the GOV.UK header, crown or logotype.
- The plate's size and alignment are the only header rules in `web/app/site.scss`.
- If Jakub prefers a white header, GOV.UK's no-branding guide allows "changing the header colour". The header would then use the light lockup.

**Enamel version** ([`a-hero-*.svg`](logo/a-hero-dark.svg), [`a-og-enamel.svg`](logo/a-og-enamel.svg), [`a-pdf-corner.svg`](logo/a-pdf-corner.svg)): backlog only. It may be used later for large decorative pieces such as a landing hero or a poster, and **never** in the header, favicon, app icons or at small sizes.

### Where it ships (`docs/logo/source/ship_a.mjs` builds the files)

| Place | File |
|---|---|
| Header | GOV.UK Generic header in `web/components/site-header.tsx`: inline SVG (paths in `web/lib/logo.ts`), plate `#ffb547` from `app/_palette.scss` via `app/site.scss`, wordmark `currentColor` (white on the black bar), then „Lubaczów” |
| Tab icon | `web/app/icon.svg` (light colours, no colour-scheme query since task 26) and `web/app/favicon.ico` (16 + 32, night tile) |
| Apple | `web/app/apple-icon.png` (180, full-bleed night tile; iOS rounds it) |
| PWA | `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, listed in `web/app/manifest.ts` |
| Share card | `web/public/og.png` (1200 × 630, flat plate on white since task 26; the night version is `docs/logo/a-og-dark.*`), in `openGraph` and `twitter` metadata |
| PDF | The band at the top of each page, drawn as vector paths from `web/lib/logo.ts` |

## Clear space and minimum size

The unit is **P**, a quarter of the plate height (34 units → P = 8.5; 8 px in the 32-px header).

- **Clear space:** at least **1 P** on every side of the plate or lockup. Keep text, rules and other marks out of it.
- **Lockup:** at least **24 px** tall on screen and **8 mm** tall in print. The header uses 32 px.
- **Plate only:** at least **20 px** tall.
- **Below 20 px use the favicon drawings:**
  - 17–32 px: use `a-favicon.svg`;
  - **16 px and smaller: always use the pixel-snapped `a-favicon-16.svg`**, never a scaled-down full mark. Its x-height and plate edges sit on whole pixels, so “ul.” stays sharp.

## Do and don't

**Do**
- Use the SVG files or `web/lib/logo.ts` as they are.
- Scale proportionally.
- Use dark files on dark, light files on light, and mono when only one colour is possible.

**Don't**
- Stretch or squash it.
- Rotate or tilt it.
- Recolour it outside the tokens below.
- Add effects to the flat mark: no shadow, gradient, glow, outline or bevel. Depth belongs only to the enamel backlog version.
- Retype “ul.” or “conaulicy” in a font. Always use the outlined paths, which carry the optical centring and kerning.
- Show the plate without its letters.
- Put the mark in a box, circle or badge. The app icons' night tile is the only exception.
- Add the city's herb or a blue-and-white street-sign look next to it. This is not an official service.

## Colour

Light only. GOV.UK Frontend's palette is used as-is, through its Sass functions (`govuk-colour()`, `govuk-functional-colour()`), never pasted hex. Only **GOV.UK's brand-blue group** is replaced, by the **Latarnia** amber/brown group, because GOV.UK forbids other sites to use its brand colours. The waste colours are for bin markers only, never for the logo.

**Logo colours** (unchanged): the plate is `#9a5700` on light (latarnia primary) and `#ffb547` on the dark header bar (contrast vs black 11.15 : 1); the wordmark is the text colour.

### Palette

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

#### Functional colours

| Role | Value | Source |
|---|---|---|
| `text` | #0b0c0c | GOV.UK (black) |
| `secondary-text` | #484949 | GOV.UK (black tint-25) |
| `inverse-text` | #ffffff | GOV.UK (white) |
| `brand` | **#9a5700** | latarnia primary (was blue) |
| `link` | **#8b4e00** | latarnia shade-10 (was blue shade-10) |
| `link-hover` | **#4d2c00** | latarnia shade-50 (was blue shade-50) |
| `link-visited` | #54319f | GOV.UK purple, **kept** |
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

**Visited links keep GOV.UK's purple.**
- It passes comfortably (9.06 : 1 on white).
- It's clearly distinct from the amber link, which is the whole point of a visited state.
- It doesn't clash with the brand: it's the colour people already know means "visited" on GOV.UK.

#### Contrast of every functional pair

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
| link-visited on body-background | 9.06 | AAA |
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

## Typography

**Atkinson Hyperlegible Next**, 400 and 700, self-hosted (SIL Open Font License); no third-party font requests. The wordmark and “ul.” are Atkinson 700, outlined.

## Tone of voice

Warm, plain and neighbourly: like a helpful neighbour, never an office. Short sentences, the everyday word, “Ty” rather than “Państwo”. Say what happens and when.

| Do | Don't |
|---|---|
| „Jutro odbiór szkła.” | „Informujemy, iż w dniu jutrzejszym nastąpi odbiór odpadów szklanych.” |
| „Wystaw pojemniki do 6:00.” | „Uprzejmie prosimy o wystawienie pojemników przed godziną 6:00.” |
| „Nie znamy jeszcze tego adresu. Sprawdź pisownię albo wpisz samą ulicę.” | „Błąd: brak wyników dla podanego zapytania.” |
| „Dodaj do kalendarza” | „Subskrybuj kanał ICS” |
| „Gdyby coś się nie zgadzało, rację ma harmonogram gminy.” | „Serwis nie ponosi odpowiedzialności za ewentualne nieścisłości.” |

No slogans, no exclamation marks, no emoji.
