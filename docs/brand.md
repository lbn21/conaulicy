# conaulicy.pl brand

The logo is the flat **“ul.” plate** (option A “Tabliczka”, refined in task 22). Together with the Latarnia palette it is the official branding. Sources and generators are in [`docs/logo/`](logo/), and the geometry and centring are explained in [`docs/logo/README.md`](logo/README.md).

## Logo variants

| Variant | File | Use |
|---|---|---|
| **Plate + wordmark** (primary) | [`a-logo-dark.svg`](logo/a-logo-dark.svg), [`a-logo-light.svg`](logo/a-logo-light.svg) | Site header, PDF header, anywhere the name is not already set big next to it |
| **Plate only** | [`a-mark-dark.svg`](logo/a-mark-dark.svg), [`a-mark-light.svg`](logo/a-mark-light.svg) | Where the name is right beside it (OG card) or space is square |
| **Mono** | [`a-logo-mono.svg`](logo/a-logo-mono.svg), [`a-mark-mono.svg`](logo/a-mark-mono.svg) | One colour, `currentColor`: stamps, single-colour print, embossing |
| **Favicons** | [`a-favicon.svg`](logo/a-favicon.svg) (32 px), [`a-favicon-16.svg`](logo/a-favicon-16.svg) (16 px) | Browser tab, app icons. Separate pixel-snapped drawings, not scaled logos |

“ul.” and the rim are **cut out** of the plate (an SVG mask), so the background shows through them in every theme.

**Enamel version** ([`a-hero-*.svg`](logo/a-hero-dark.svg), [`a-og-enamel.svg`](logo/a-og-enamel.svg), [`a-pdf-corner.svg`](logo/a-pdf-corner.svg)): backlog only. It may be used later for large decorative pieces such as a landing hero or a poster, and **never** in the header, favicon, app icons or at small sizes.

### Where it ships (`docs/logo/source/ship_a.mjs` builds the files)

| Place | File |
|---|---|
| Header | Inline SVG in `web/components/site-header.tsx`; paths are in `web/lib/logo.ts`. Plate `var(--accent)`, wordmark `currentColor` |
| Tab icon | `web/app/icon.svg` (switches colours with `prefers-color-scheme`) and `web/app/favicon.ico` (16 + 32, dark colours) |
| Apple | `web/app/apple-icon.png` (180, full-bleed night tile; iOS rounds it) |
| PWA | `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, listed in `web/app/manifest.ts` |
| Share card | `web/public/og.png` (1200 × 630, flat plate), in `openGraph` and `twitter` metadata |
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

From `design/tokens.css` (Latarnia). Contrast ratios are in the table in [`design/tokens.md`](../design/tokens.md#contrast) (`node design/contrast.mjs`); no new pairs are introduced here.

| | Dark (default) | Light |
|---|---|---|
| Plate: `accent` | `#ffb547` | `#9a5700` |
| Wordmark: `text` | `#e9edf2` | `#161b24` |
| Background (shows through “ul.”): `background` | `#10141d` | `#f5f7fa` |
| Letters on a solid plate (favicon): `accent-contrast` | `#10141d` | `#ffffff` |

Amber is the only accent. Waste colours are for bins only, never for the logo.

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
