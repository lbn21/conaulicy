# Latarnia — design tokens

Source of truth: `design/tokens.css` (Tailwind v4, not yet imported by the app). Contrast check: `node design/contrast.mjs`.

## Rationale

- **Latarnia** — "warm lamp light in a window once it is dark outside". Night-navy surfaces, one amber accent. Dark is the default theme. Light follows `prefers-color-scheme`, and `[data-theme]` overrides both.
- **Accent is fixed**: dark `#ffb547`, light `#9a5700`. `primary` is an alias of `accent`. Text on the accent uses `accent-contrast`.
- **Typography**: Atkinson Hyperlegible Next, self-hosted (latin + latin-ext woff2), weights 400 and 700 only. Body text is 18px (`1.125rem`), and the type scale is mobile-first.
- **Rhythm**: 4px spacing (`--spacing: 0.25rem`), one small radius (`--radius-sm: 4px`), one subtle elevation (`--shadow-raised`). No gradients.
- **Waste colours** are fills. Each has a `-fg` for the label text on that fill. Papier is blue, szkło green, metale i tworzywa yellow, bio brown. Zmieszane is black, with a 1px `--waste-zmieszane-border` so the swatch stays visible on the night background. Popiół is a neutral grey. Gabaryty is a rose, distinct from the amber accent.
- Starting from the Latarnia sample, these changed: added `surface-2`; renamed `muted` to `text-muted` and `on-accent` to `accent-contrast`; light `border` darkened to `#6f7a8d` so it clears 3:1 on `surface-2`; light `secondary` is now `#e8ecf2`; gabaryty moved from lavender to rose; bio moved away from the amber accent (dark `#c4936a`, light `#7a4b2a`); light plastik-metale is `#7d6200`.

## Dark (default)

| Token | Hex | Role |
| --- | --- | --- |
| `background` | `#10141d` | page background |
| `surface` | `#19202b` | cards, search field |
| `surface-2` | `#212937` | nested/raised surface |
| `text` | `#e9edf2` | body text |
| `text-muted` | `#b4bcc8` | secondary text, placeholder |
| `border` | `#6f7a8d` | field and control borders |
| `accent` / `primary` | `#ffb547` | the single accent: CTA, "jutro" |
| `accent-contrast` | `#10141d` | text on accent |
| `secondary` | `#262e3b` | chip / label background |
| `focus` | `#ffdda0` | focus ring |
| `success` | `#6fd49a` | success message |
| `warning` | `#f2a65a` | warning message |
| `danger` | `#ff8f85` | error message |
| `waste-zmieszane` / `-fg` / `-border` | `#111111` / `#f5f7fa` / `#9aa3b2` | mixed waste, black bin |
| `waste-papier` / `-fg` | `#6eb4ff` / `#10141d` | paper |
| `waste-plastik-metale` / `-fg` | `#f4d35e` / `#10141d` | plastic and metal |
| `waste-szklo` / `-fg` | `#58d39a` / `#10141d` | glass |
| `waste-bio` / `-fg` | `#c4936a` / `#10141d` | bio |
| `waste-popiol` / `-fg` | `#c4c8ce` / `#10141d` | ash, grey bag |
| `waste-gabaryty` / `-fg` | `#f293b8` / `#10141d` | bulky waste |

## Light

| Token | Hex | Role |
| --- | --- | --- |
| `background` | `#f5f7fa` | page background |
| `surface` | `#ffffff` | cards, search field |
| `surface-2` | `#eef1f5` | nested/raised surface |
| `text` | `#161b24` | body text |
| `text-muted` | `#4a5568` | secondary text, placeholder |
| `border` | `#6f7a8d` | field and control borders |
| `accent` / `primary` | `#9a5700` | the single accent: CTA, "jutro" |
| `accent-contrast` | `#ffffff` | text on accent |
| `secondary` | `#e8ecf2` | chip / label background |
| `focus` | `#6b3d00` | focus ring |
| `success` | `#1e7a46` | success message |
| `warning` | `#a0420a` | warning message |
| `danger` | `#b42318` | error message |
| `waste-zmieszane` / `-fg` / `-border` | `#111111` / `#ffffff` / `#111111` | mixed waste, black bin |
| `waste-papier` / `-fg` | `#1f63c7` / `#ffffff` | paper |
| `waste-plastik-metale` / `-fg` | `#7d6200` / `#ffffff` | plastic and metal |
| `waste-szklo` / `-fg` | `#1e7f4f` / `#ffffff` | glass |
| `waste-bio` / `-fg` | `#7a4b2a` / `#ffffff` | bio |
| `waste-popiol` / `-fg` | `#5c6370` / `#ffffff` | ash, grey bag |
| `waste-gabaryty` / `-fg` | `#a8336a` / `#ffffff` | bulky waste |

## Kolory pojemników

The swatches follow the bins and bags people already have at the gate.

- Papier blue, szkło green, metale i tworzywa sztuczne yellow, bio brown: Rozporządzenie Ministra Klimatu i Środowiska z 10 maja 2021 r. (Dz.U. 2021 poz. 906).
- Zmieszane, black containers and bags: Regulamin utrzymania czystości i porządku Gminy Miejskiej Lubaczów, uchwała nr 101/X/2024, § 3.
- Popiół, grey bags: UM Lubaczów, from July 2025.

Zmieszane is `#111111` in both themes. On the dark background that fill is only 1.02:1, so the swatch draws a 1px `#9aa3b2` border (7.24:1 against the background). Text on every swatch is at least 4.5:1. Gabaryty stays rose; the regulation does not assign it a bin colour.

## Contrast

Computed by `node design/contrast.mjs` (WCAG 2.x, sRGB relative luminance). Text pairs need 4.5:1 (AAA at 7:1). Non-text pairs need 3:1 (AAA not applicable). The script exits 1 if any pair fails.

### dark

| Pair | Ratio | AA | AAA |
| --- | ---: | --- | --- |
| text on background | 15.67 | pass | pass |
| text on surface | 13.92 | pass | pass |
| text on surface-2 | 12.43 | pass | pass |
| text on secondary | 11.63 | pass | pass |
| text-muted on background | 9.62 | pass | pass |
| text-muted on surface | 8.55 | pass | pass |
| text-muted on surface-2 | 7.63 | pass | pass |
| accent-contrast on accent | 10.49 | pass | pass |
| success on background | 10.14 | pass | pass |
| success on surface | 9.01 | pass | pass |
| warning on background | 9.10 | pass | pass |
| warning on surface | 8.09 | pass | pass |
| danger on background | 8.35 | pass | pass |
| danger on surface | 7.42 | pass | pass |
| border vs background | 4.25 | pass | N/A |
| border vs surface | 3.78 | pass | N/A |
| border vs surface-2 | 3.37 | pass | N/A |
| focus vs background | 14.13 | pass | N/A |
| focus vs surface | 12.55 | pass | N/A |
| accent vs background | 10.49 | pass | N/A |
| waste-zmieszane-fg on waste-zmieszane | 17.59 | pass | pass |
| waste-papier-fg on waste-papier | 8.45 | pass | pass |
| waste-plastik-metale-fg on waste-plastik-metale | 12.57 | pass | pass |
| waste-szklo-fg on waste-szklo | 9.83 | pass | pass |
| waste-bio-fg on waste-bio | 6.78 | pass | fail |
| waste-popiol-fg on waste-popiol | 10.97 | pass | pass |
| waste-gabaryty-fg on waste-gabaryty | 8.46 | pass | pass |
| waste-zmieszane-border vs background | 7.24 | pass | N/A |
| waste-zmieszane vs background | 1.02 | n/a (see border) | N/A |
| waste-papier vs background | 8.45 | pass | N/A |
| waste-plastik-metale vs background | 12.57 | pass | N/A |
| waste-szklo vs background | 9.83 | pass | N/A |
| waste-bio vs background | 6.78 | pass | N/A |
| waste-popiol vs background | 10.97 | pass | N/A |
| waste-gabaryty vs background | 8.46 | pass | N/A |

### light

| Pair | Ratio | AA | AAA |
| --- | ---: | --- | --- |
| text on background | 16.09 | pass | pass |
| text on surface | 17.26 | pass | pass |
| text on surface-2 | 15.24 | pass | pass |
| text on secondary | 14.56 | pass | pass |
| text-muted on background | 7.01 | pass | pass |
| text-muted on surface | 7.53 | pass | pass |
| text-muted on surface-2 | 6.64 | pass | fail |
| accent-contrast on accent | 5.62 | pass | fail |
| success on background | 4.98 | pass | fail |
| success on surface | 5.35 | pass | fail |
| warning on background | 5.97 | pass | fail |
| warning on surface | 6.41 | pass | fail |
| danger on background | 6.13 | pass | fail |
| danger on surface | 6.57 | pass | fail |
| border vs background | 4.04 | pass | N/A |
| border vs surface | 4.33 | pass | N/A |
| border vs surface-2 | 3.83 | pass | N/A |
| focus vs background | 8.53 | pass | N/A |
| focus vs surface | 9.16 | pass | N/A |
| accent vs background | 5.24 | pass | N/A |
| waste-zmieszane-fg on waste-zmieszane | 18.88 | pass | pass |
| waste-papier-fg on waste-papier | 5.73 | pass | fail |
| waste-plastik-metale-fg on waste-plastik-metale | 5.80 | pass | fail |
| waste-szklo-fg on waste-szklo | 5.00 | pass | fail |
| waste-bio-fg on waste-bio | 7.32 | pass | pass |
| waste-popiol-fg on waste-popiol | 6.05 | pass | fail |
| waste-gabaryty-fg on waste-gabaryty | 6.27 | pass | fail |
| waste-zmieszane-border vs background | 17.59 | pass | N/A |
| waste-zmieszane vs background | 17.59 | n/a (see border) | N/A |
| waste-papier vs background | 5.34 | pass | N/A |
| waste-plastik-metale vs background | 5.41 | pass | N/A |
| waste-szklo vs background | 4.65 | pass | N/A |
| waste-bio vs background | 6.82 | pass | N/A |
| waste-popiol vs background | 5.63 | pass | N/A |
| waste-gabaryty vs background | 5.85 | pass | N/A |

## Design principles: avoid the AI look

Future UI step. Goal: sexy, and must not look AI-generated at first glance.

**DON'T:** purple/indigo gradients, glassmorphism, emoji as icons, generic grid of rounded cards with soft shadows, sparkle/magic motifs, generic marketing slogans, default Inter/shadcn look.

**DO:** strong editorial typography, one bold accent (Latarnia amber), restraint, local Lubaczów character, concrete warm human Polish copy, crafted micro-details (motion, spacing rhythm, empty/error states).
