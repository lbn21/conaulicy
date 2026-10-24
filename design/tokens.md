# Colour and type tokens

Light only, as GOV.UK. Values: `design/tokens.css`; the bin colours the site uses are in `web/app/tokens.css`, which the contrast check reads. Contrast check: `node design/contrast.mjs`.

## Rationale
- **GOV.UK Frontend as-is, including its palette; only the brand-blue roles, the typeface and the logo are ours** (`docs/govuk-audit.md`). The full palette, with every group and step, is in `docs/brand.md`.
- **The Latarnia group** replaces GOV.UK's brand blue. It is computed from `#9a5700` with GOV.UK's own tint/shade percentages (`web/app/_palette.scss`). Brand is its primary, links are shade-10 `#8b4e00`, link hover is shade-50 `#4d2c00`, and the template and surface backgrounds are tint-95 `#faf7f2`. Visited links have no colour of their own: `link-visited` is the link colour.
- **Everything else is GOV.UK's:**
  - text `#0b0c0c`, secondary text `#484949`;
  - yellow focus `#ffdd00` with black `#0b0c0c`;
  - error `#ca3535`, success and buttons green `#0f7a52`;
  - borders `#cecece`, input borders black.
- **The header bar** is the Latarnia shade-50 `#4d2c00` (Jakub's decision, task 88), not the Generic header's black; `theme-color` and the PDF band follow it. Its GOV.UK focus bar takes the same colour, so the yellow focus box (9.31:1 on the brown) carries the focus on its own.
- **The logo plate** is GOV.UK white on the brown header bar, as GOV.UK's white crown.
- **Typography:** Atkinson Hyperlegible Next, self-hosted, weights 400 and 700, instead of GDS Transport (which GOV.UK reserves for its own services).
- **Waste colours** are fills, each with a `-fg` for the label text on that fill. Papier is blue, szkło green, metale i tworzywa yellow, bio brown, zmieszane black, popiół grey. The rare fractions each have their own colour, as in the Miasto Lubaczów schedule table: gabaryty orange, elektro navy, opony mid grey, tekstylia rose. The label next to every bin names the fraction, so colour is never the only cue.

## Bin colours
| Token | Hex | Role |
| --- | --- | --- |
| `waste-zmieszane` / `-fg` / `-border` | `#111111` / `#ffffff` / `#111111` | mixed waste, black bin |
| `waste-papier` / `-fg` | `#1f63c7` / `#ffffff` | paper |
| `waste-plastik-metale` / `-fg` / `-border` | `#f2c200` / `#161b24` / `#7d6200` | plastic and metal, yellow bin |
| `waste-plastik-metale-print` | `#5c4800` | the PDF's outline of the plastic and metal mark |
| `waste-szklo` / `-fg` | `#1e7f4f` / `#ffffff` | glass |
| `waste-bio` / `-fg` | `#7a4b2a` / `#ffffff` | bio |
| `waste-popiol` / `-fg` | `#5c6370` / `#ffffff` | ash, grey bag |
| `waste-gabaryty` / `-fg` | `#c2410c` / `#ffffff` | bulky waste (wielkogabarytowe) |
| `waste-elektro` / `-fg` / `-border` | `#1e3a8a` / `#ffffff` / `transparent` | electrical and electronic |
| `waste-opony` / `-fg` / `-border` | `#a3aab5` / `#161b24` / `#4a5160` | used tyres |
| `waste-tekstylia` / `-fg` | `#a8336a` / `#ffffff` | clothes and textiles |

## Kolory pojemników

The swatches follow the bins and bags people already have at the gate.

- Papier blue, szkło green, metale i tworzywa sztuczne yellow, bio brown: Rozporządzenie Ministra Klimatu i Środowiska z 10 maja 2021 r. (Dz.U. 2021 poz. 906).
- Zmieszane, black containers and bags: Regulamin utrzymania czystości i porządku Gminy Miejskiej Lubaczów, uchwała nr 101/X/2024, § 3.
- Popiół, grey bags (szare worki): UM Lubaczów, od lipca, as reported by [Business Insider](https://businessinsider.com.pl/wiadomosci/nowy-szary-worek-na-smieci-ruszaja-tez-kontrole/fgzpxpc). The article does not give a year.

Metale i tworzywa is a clear yellow `#f2c200` (1.68:1 against the white page), so the bin draws a dark `#7d6200` outline and shading (5.80:1). The printed PDF outlines its small diamond mark in the darker `#5c4800` (`--waste-plastik-metale-print`, 8.82:1 on white paper). Labels next to the bins stay in the normal text colour. Text on every swatch is at least 4.5:1.

The rare fractions follow the colours of the Miasto Lubaczów schedule table; the regulation does not assign them bins. Opony is a light grey `#a3aab5` (2.34:1) with a `#4a5160` outline (7.96:1). Tekstylia keeps the rose that gabaryty had before; gabaryty is now orange, distinct from the amber accent and the bio brown.

## Contrast

Computed by `node design/contrast.mjs` (WCAG 2.x, sRGB relative luminance), light only. Text pairs need 4.5:1 (AAA at 7:1); non-text pairs need 3:1. "info" pairs are reported but not required:
- the yellow focus on white is carried by its black edge, as on GOV.UK;
- borders and the surface border are decorative dividers, never the only cue;
- light bin fills are carried by their outline.

The script exits 1 if a required pair fails. Pairs that reach AAA (text, 7:1+): body text, secondary text, link hover, active links, focus text, the button hover, the secondary button, surface text, header text. Bin labels sit next to the bins in the text colour, so the `-fg` tokens have no pair on the site. Print outlines (`-print`) are "ui" pairs against white paper.

| Pair | Ratio | AA | AAA |
| --- | ---: | --- | --- |
| text on body-background | 19.59 | pass | pass |
| text on template-background | 18.33 | pass | pass |
| secondary-text on body-background | 9.03 | pass | pass |
| secondary-text on template-background | 8.45 | pass | pass |
| inverse-text on brand | 5.62 | pass | fail |
| link on body-background | 6.59 | pass | fail |
| link on template-background | 6.17 | pass | fail |
| link on surface-background | 6.17 | pass | fail |
| link-hover on body-background | 12.53 | pass | pass |
| link-active on body-background | 19.59 | pass | pass |
| focus-text on focus | 14.55 | pass | pass |
| error on body-background | 5.16 | pass | fail |
| success on body-background | 5.35 | pass | fail |
| inverse-text on button | 5.35 | pass | fail |
| inverse-text on button-hover | 8.03 | pass | pass |
| inverse-text on error | 5.16 | pass | fail |
| text on secondary-button | 17.65 | pass | pass |
| surface-text on surface-background | 18.33 | pass | pass |
| inverse-text on header-background | 12.53 | pass | pass |
| input-border vs body-background | 19.59 | pass | N/A |
| focus vs focus-text | 14.55 | pass | N/A |
| brand vs body-background | 5.62 | pass | N/A |
| logo-plate vs header-background | 12.53 | pass | N/A |
| logo-plate-focus vs focus | 14.55 | pass | N/A |
| focus vs header-background | 9.31 | pass | N/A |
| focus vs body-background | 1.35 | n/a (see note) | N/A |
| border vs body-background | 1.57 | n/a (see note) | N/A |
| surface-border vs surface-background | 2.02 | n/a (see note) | N/A |
| waste-zmieszane-border vs body-background | 18.88 | pass | N/A |
| waste-zmieszane vs body-background | 18.88 | n/a (see note) | N/A |
| waste-papier vs body-background | 5.73 | pass | N/A |
| waste-plastik-metale-border vs body-background | 5.80 | pass | N/A |
| waste-plastik-metale vs body-background | 1.68 | n/a (see note) | N/A |
| waste-szklo vs body-background | 5.00 | pass | N/A |
| waste-bio vs body-background | 7.32 | pass | N/A |
| waste-popiol vs body-background | 6.05 | pass | N/A |
| waste-gabaryty vs body-background | 5.18 | pass | N/A |
| waste-elektro vs body-background | 10.36 | pass | N/A |
| waste-opony-border vs body-background | 7.96 | pass | N/A |
| waste-opony vs body-background | 2.34 | n/a (see note) | N/A |
| waste-tekstylia vs body-background | 6.27 | pass | N/A |
| waste-plastik-metale-print vs body-background | 8.82 | pass | N/A |
