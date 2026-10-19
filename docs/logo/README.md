# “ul.” plate logo — three options

Concepts for Jakub to choose from (task 20). **Nothing here is live**: the header (`web/components/site-header.tsx`), favicon and manifest are unchanged until a variant is picked.

![Comparison sheet](comparison-sheet.png)

`comparison-sheet.png`: per variant, the favicon at 16, 32 and 180 px and the header at 360 px wide, dark and light. Rendered with Playwright from the SVGs in this folder.

## The three ideas

| | Name | Idea | Mark vs. name | Favicon |
|---|---|---|---|---|
| **A** | Tabliczka | A compact enamel plate: filled amber, with a fine inset rim like pressed enamel; “ul.” knocked out. Calm and solid. | The plate is a badge; “conaulicy” sits beside it in the text colour. | The plate alone, no rim: “ul.” as large as it gets. |
| **B** | Latarnia | A hanging sign: outlined plate on a wall bracket, lit by a small street lantern with a warm glow (the palette is called Latarnia). The most illustrative. | The sign carries “ul.” in amber; “conaulicy” beside it. | The sign alone, hanging from a hook on a V cord; no bracket or lamp at 16 px. |
| **C** | Ulica conaulicy | The name is the street: one wide plate with gently bowed edges reads “ul. conaulicy”, small “ul.” and the name sharing a baseline. The boldest, and the name and the mark are one. | Everything is on the plate. | The plate's first letter, “c”, on a bowed tile. |

All three avoid the blue-and-white MSI street sign, the city's herb and any official symbol, and use only the Latarnia amber: `#FFB547` on dark, `#9A5700` on light.

## Files (per variant `a`, `b`, `c`)

| File | What |
|---|---|
| `{v}-logo-dark.svg` | Full mark (plate + conaulicy) for the dark theme |
| `{v}-logo-light.svg` | Full mark for the light theme |
| `{v}-logo-mono.svg` | One colour, `currentColor` (B drops the lantern glow) |
| `{v}-favicon.svg` | Simplified 32×32 favicon, legible at 16 px; switches amber with `prefers-color-scheme` |
| `{v}-icon-32.png` | PNG fallback, transparent |
| `{v}-icon-180.png` | Apple touch icon, on the night tile |
| `{v}-icon-512.png` | PWA icon, on the night tile |
| `{v}-icon-maskable-512.png` | Maskable PWA icon: full-bleed tile, mark inside the 80 % safe circle |

## How they are made

- Letters are Atkinson Hyperlegible Next **700**, shaped with HarfBuzz (kerning on), then optically kerned by hand (“u–l” closed up, “l–.” opened, “c–o” opened, “l–i” and “c–y” tightened) and **outlined to paths**. No font is embedded.
- Knock-outs use an SVG mask, so the plate's text shows whatever is behind it, in every theme and in `currentColor`.
- Paths only, no raster, no `<text>`. Optimised with SVGO 4.1.0 (`source/svgo.config.mjs`: `inlineStyles` off so the favicon's colour-scheme media query survives). Logos are 2.8–3.4 KB, favicons 0.7–1 KB.
- `source/make_logos.py` regenerates the SVGs (needs `fonttools` and `uharfbuzz`), then:
  `npx svgo@4.1.0 --config docs/logo/source/svgo.config.mjs -f <out> -o docs/logo`

## When one is picked

Swap the mark in `site-header.tsx` (inline the chosen `{v}-logo-*.svg` paths, or a themed `<svg>` using `var(--accent)` and `var(--text)`), replace `web/app/favicon.ico` with `{v}-favicon.svg` plus the 32 px PNG, add the 180 px apple icon, and add the 512 and maskable icons to a manifest. That is a separate PR.
