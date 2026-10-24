# conaulicy.pl brand

The site uses **GOV.UK Frontend as-is, including its palette**. Only three things are ours, because GOV.UK forbids other sites to copy them: the brand colours (the Latarnia group), the typeface (Atkinson Hyperlegible Next) and the logo (the flat "ul." plate). Light theme only. Logo sources and generators: [`docs/logo/`](logo/); geometry and centring: [`docs/logo/README.md`](logo/README.md).

## Logo

| Variant | File | Use |
|---|---|---|
| **Plate + wordmark, light** (primary) | [`a-logo-light.svg`](logo/a-logo-light.svg) | Light backgrounds: pages, print, share images |
| **Plate + wordmark, on dark** | [`a-logo-dark.svg`](logo/a-logo-dark.svg) | Dark backgrounds only. Not the site header or the PDF band: those draw the plate white from `web/lib/logo.ts`, as GOV.UK's white crown |
| **Plate only** | [`a-mark-light.svg`](logo/a-mark-light.svg), [`a-mark-dark.svg`](logo/a-mark-dark.svg) | Where the name is right beside it (OG card) or space is square |
| **Mono** | [`a-logo-mono.svg`](logo/a-logo-mono.svg), [`a-mark-mono.svg`](logo/a-mark-mono.svg) | One colour, `currentColor`: stamps, single-colour print, embossing |
| **Favicons** | [`a-favicon.svg`](logo/a-favicon.svg) (32 px), [`a-favicon-16.svg`](logo/a-favicon-16.svg) (16 px) | Browser tab, app icons: separate pixel-snapped drawings |

- "ul." and the rim are **cut out** of the plate (an SVG mask), so the background shows through them.
- **Header:** the GOV.UK **Generic header** (`govuk-generic-header`), markup as its template, with only our logo in `govuk-generic-header__homepage-link`. The place name is in the page content, not the header. Never the GOV.UK header, the crown or the GOV.UK logotype. The header rules in `web/app/site.scss` are the bar's colour (Latarnia shade-50 `#4d2c00`, not the Generic header's black: Jakub's decision, task 88), the plate colour (white; black on focus), the logo's geometry (30 px tall, padding 18/11, `top: -2px`: the plate centred in the 62 px bar, 16 px above and below), GOV.UK's hover bar made 4 px and centred under the plate, GOV.UK's focus bar in the header's colour so it does not show (the yellow box with the black plate carries the focus, 9.31 : 1 on the brown), an even 6 px focus box round the plate, and the wordmark's x-height centred on the plate (see [`docs/logo/README.md`](logo/README.md)).
- **Footer:** our own markup with `govuk-footer` classes, laid out as the GOV.UK footer (`web/components/site-footer.tsx`): the „ul.” plate in one colour (text colour) where GOV.UK has its crown; navigation from a config of live features, shown (with its section break) only once it has two or more links; meta links (Dostępność, Prywatność, O projekcie); „Zrobił Jakub Marciniszyn dla mieszkańców Lubaczowa.” and „Nie jesteśmy urzędem”; our texts under CC BY 4.0 and the schedules' source; „© 2026 conaulicy.pl” as plain text. Never the GOV.UK footer component, the crown, the crest (`$govuk-image-url-function` compiles GOV.UK image URLs to `none`), the Open Government Licence or a Crown copyright line. The code licences (GOV.UK Frontend, MIT; Atkinson Hyperlegible Next, SIL OFL) are credited on /dostepnosc, „Z czego zbudowana jest strona”.
- **Enamel version** ([`a-hero-*.svg`](logo/a-hero-dark.svg), [`a-og-enamel.svg`](logo/a-og-enamel.svg), [`a-pdf-corner.svg`](logo/a-pdf-corner.svg)): only for large decorative pieces such as a poster, and never in the header, favicon, app icons or at small sizes.

### Where it ships (`docs/logo/source/ship_a.mjs` builds the files)

| Place | File |
|---|---|
| Header | `web/components/site-header.tsx`: inline SVG (paths in `web/lib/logo.ts`); plate GOV.UK white (`govuk-colour("white")` in `app/site.scss`) on the brown bar (`$app-header-colour`, Latarnia shade-50 `#4d2c00`), the "ul." and rim cut out to the brown; wordmark `currentColor` (white); on focus, a black plate with the "ul." in focus yellow (the plate takes `currentColor`, GOV.UK's focus-text) |
| Tab icon | `web/app/icon.svg` and `web/app/favicon.ico` (16 from `a-favicon-16.svg`, 32 from `a-favicon.svg`): the `#9a5700` plate with white “ul.”, transparent around it |
| Apple | `web/app/apple-icon.png` (180): the 32-px favicon on a full-bleed white tile; iOS rounds it |
| PWA | `web/public/icon-192.png`, `icon-512.png` (white tile, rounded corners) and `icon-maskable-512.png` (full-bleed white, plate inside the central 80 % circle), listed in `web/app/manifest.ts` |
| Share card | `web/public/og.png` (1200 × 630): the flat `#9a5700` plate, rim and “ul.” cut out, on white, in the `openGraph` and `twitter` metadata |
| PDF | The brown band (`THEME_COLOR`, `#4d2c00`) at the top of each page, as in the site header (white plate, wordmark x-height centred on the plate), drawn as vector paths from `web/lib/logo.ts` |

## Clear space and minimum size

The unit is **P**, a quarter of the plate height (34 units → P = 8.5; 7.5 px in the 30-px header).

- **Clear space:** at least **1 P** on every side of the plate or lockup. Keep text, rules and other marks out of it.
- **Lockup:** at least **24 px** tall on screen and **8 mm** tall in print. The header uses 30 px.
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
- Put the mark in a box, circle or badge. The app icons' white tile is the only exception: launchers need an opaque square.
- Add the city's herb or a blue-and-white street-sign look next to it. This is not an official service.

## Colour

- GOV.UK Frontend's palette and functional colours are used as-is, through its Sass functions (`govuk-colour()`, `govuk-functional-colour()`); never pasted hex. The one exception besides the brand roles: visited links (below).
- **GOV.UK's brand-blue group is never used.** Its roles take the **Latarnia** group, computed from `#9a5700` with GOV.UK's own method: tints are the primary mixed with white, shades with black, at GOV.UK's percentages. Applied to `#1d70b8`, the method gives GOV.UK's blue group exactly. Defined once in `web/app/_palette.scss`.
- **Exceptions** (brand blue hard-coded upstream, with no setting; enforced by `check-own-css` and `check-govuk-assets`):
  - `.govuk-button--inverse`: may appear in the CSS output, never in markup.
  - accessible-autocomplete's highlighted option: the colour stays in its unchanged CSS; `site.scss` repaints it with the brand role (`#9a5700`, white text), so the blue is never rendered.
- **Logo colours:** the plate is `#9a5700` on light and GOV.UK white on the brown header `#4d2c00` (12.53 : 1); the wordmark is the text colour on light and white in the header. The header, `theme-color` and the web app manifest's `theme_color` are Latarnia shade-50 `#4d2c00` (`THEME_COLOR` in `web/lib/theme.ts`). On focus the header plate is focus-text black on focus yellow (14.55 : 1).
- **Bin colours** are real-world colours for the bin markers only, never for the logo. Defined in `web/app/tokens.css`; rationale in `design/tokens.md`.
- **PDF fraction marks:** the printable PDF marks each fraction with a shape in its bin colour, so it reads in black-and-white print and for colour-blind readers: zmieszane ● circle, popiół ○ ring, bio ■ square, papier ▲ triangle, tworzywa ◆ diamond (dark outline), szkło ★ star; rare fractions a letter in an outlined square (G wielkogabarytowe, E elektro, O opony, T tekstylia). The website keeps its bin icons.

### Palette

Structure and percentages from [GOV.UK colour](https://design-system.service.gov.uk/styles/colour/) and `govuk-frontend` 6.5.1 [`settings/_colours-palette--internal.scss`](https://github.com/alphagov/govuk-frontend/blob/v6.5.1/packages/govuk-frontend/src/govuk/settings/_colours-palette--internal.scss).

| Group | primary | tint-25 | tint-50 | tint-80 | tint-95 | shade-10 | shade-25 | shade-50 |
|---|---|---|---|---|---|---|---|---|
| **latarnia** (ours: GOV.UK's brand roles) | #9a5700 | #b38140 | #cdab80 | #ebddcc | #faf7f2 | #8b4e00 | #744100 | #4d2c00 |
| blue (GOV.UK brand: never used) | #1d70b8 | #5694ca | #8eb8dc | #d2e2f1 | #f4f8fb | #1a65a6 | #16548a | #0f385c |
| green | #0f7a52 | #4b9b7d | #87bca8 | #cfe4dc | #f3f8f6 | | #0b5c3e | #083d29 |
| teal | #158187 | #50a1a5 | #8ac0c3 | #d0e6e7 | #f3f9f9 | | #106165 | #0b4144 |
| purple | #54319f | #7f65b7 | #aa98cf | #ddd6ec | #f6f5fa | | #3f2577 | #2a1950 |
| magenta | #ca357c | #d7689d | #e59abe | #f4d7e5 | #fcf5f8 | | #98285d | #651b3e |
| red | #ca3535 | #d76868 | #e59a9a | #f4d7d7 | #fcf5f5 | | #982828 | #651b1b |
| orange | #f47738 | #f7996a | #fabb9c | #fde4d7 | #fef8f5 | | #b7592a | #7a3c1c |
| yellow | #ffdd00 | #ffe640 | #ffee80 | #fff8cc | #fffdf2 | | #bfa600 | #806f00 |
| brown | #99704a | #b39477 | #ccb8a5 | | #faf8f6 | | | |
| black | #0b0c0c | #484949 | #858686 | #cecece | #f3f3f3 | | | |
| white | #ffffff | | | | | | | |

(Teal also has `accent` #00ffe0.)

### Functional colours

| Role | Value | Source |
|---|---|---|
| `text` | #0b0c0c | GOV.UK (black) |
| `secondary-text` | #484949 | GOV.UK (black tint-25) |
| `inverse-text` | #ffffff | GOV.UK (white) |
| `brand` | **#9a5700** | latarnia primary |
| `link` | **#8b4e00** | latarnia shade-10 |
| `link-hover` | **#4d2c00** | latarnia shade-50 |
| `link-visited` | **#8b4e00** | latarnia shade-10, the link colour |
| `link-active` | #0b0c0c | GOV.UK (black) |
| `border` | #cecece | GOV.UK (black tint-80) |
| `input-border` | #0b0c0c | GOV.UK (black) |
| `template-background` | **#faf7f2** | latarnia tint-95 |
| `body-background` | #ffffff | GOV.UK (white) |
| `focus` | #ffdd00 | GOV.UK (yellow) |
| `focus-text` | #0b0c0c | GOV.UK (black) |
| `error` | #ca3535 | GOV.UK (red) |
| `success` | #0f7a52 | GOV.UK (green) |
| `hover` | #cecece | GOV.UK (black tint-80) |
| `surface-background` | **#faf7f2** | latarnia tint-95 |
| `surface-text` | #0b0c0c | GOV.UK (black) |
| `surface-border` | **#cdab80** | latarnia tint-50 |

Visited links have no colour of their own: `link-visited` is the link colour (`web/app/_settings.scss`), as GOV.UK's links without a visited state. A deviation Jakub chose; see D5 in `docs/govuk-audit.md`.

### Contrast

WCAG 2.x, computed by `node design/contrast.mjs`, which CI runs on every pull request (the web job's "Contrast" step). It exits 1 if a required pair fails, or if a colour token in `web/app/tokens.css` is in no text or UI pair and not in its `NOT_CHECKED` list with the reason (today: the outlined fills, whose `-border` outline carries the contrast, and the transparent `--waste-elektro-border`). Text needs 4.5 : 1 and UI components 3 : 1.

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
| surface-border vs surface-background | 2.02 | decorative; never the only cue |
| border vs body-background | 1.57 | decorative divider (GOV.UK default); never the only cue |
| brand vs body-background | 5.62 | UI pass |
| Generic header text (white) on the header #4d2c00 | 12.53 | AAA |
| logo plate white #ffffff on the header #4d2c00 | 12.53 | UI pass |
| focus yellow vs the header #4d2c00 (no focus bar in the header) | 9.31 | UI pass |
| logo plate on focus (focus-text #0b0c0c) vs focus yellow | 14.55 | UI pass |

## Typography

**Atkinson Hyperlegible Next**, 400 and 700, self-hosted (SIL Open Font License); no third-party font requests. The wordmark and "ul." are Atkinson 700, outlined. GOV.UK's type scale and sizes apply unchanged. Until the font loads, a metric-matched Arial fallback (`web/app/tokens.css`) holds the layout, so the swap moves nothing.

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
