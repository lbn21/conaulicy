# Task 80: centre the bin icons next to their labels

Draft PR, one branch (`ui/80-bin-centre`), only `web/lib/waste-bin.ts` and this brief (plus before/after crops in `docs/tasks/task-80/`). No drive-by changes, no database, no `next build/start/dev` locally.

## Goal

The bin icon beside each fraction's name on the street page sits visibly low. Centre it on the label.

## Root cause

`.app-bin` (`web/app/site.scss`) is `vertical-align: middle`, which centres the svg's **box** on the label's x-height. The **artwork** is not centred in that box: in the 28×40 viewBox the ink runs x 1.5–26, y 6–39 (handle top to wheel bottom), so the margins are 1.5 left / 2 right and 6 top / 1 bottom. The ink centre is 2.5 units below the box centre: 2.5 px at 40 px, 3 px at 48 px.

## Plan

- Move the artwork in `BIN` (`web/lib/waste-bin.ts`) by (+0.25, −2.5) units, so the ink's margins are 1.75 on both sides and 3.5 on top and bottom. The viewBox, the svg's width and height, the scale and the shapes stay the same, so the icon looks the same size and nothing else on the page moves.
- No `translateY` or margin nudge in CSS.
- Outlined bins (stroke 1.2) get 0.6 extra on every outer edge (handle, wheel, lid), so their ink is centred too.

### Where the bin artwork is used

- `web/components/pickup-schedule.tsx` (`WasteMark`, 28×40 and 34×48 large): the only place that draws it. It changes.
- PDF (`harmonogram.pdf/route.ts`): draws its own marks (circle, ring, square…), not `BIN`. It does not change.
- OG image, favicons, other components: none use it.

## Acceptance criteria

- Ink margins equal top/bottom and left/right, within 0.25 px at 1× of the viewBox.
- Icon ink centre within ±0.5 px of the label's x-height centre, at 40 and 48 px, at 375 and 1280 px wide; the cap-height-centre offset reported too.
- Before/after table for every bin type on `/adres/0972447-29830`; crops in `docs/tasks/task-80/`.
- Icon stays decorative (`aria-hidden`), no layout shift elsewhere, CI green.

## Result

### Geometry (viewBox units, 1×)

| | left | right | top | bottom |
|---|---|---|---|---|
| before | 1.5 | 2 | 6 | 1 |
| after | 1.75 | 1.75 | 3.5 | 3.5 |
| after, outlined (stroke 1.2) | 1.15 | 1.15 | 2.9 | 2.9 |

The ink stays 24.5 × 33 units, so the icon is the same size.

### Measured on the page (px)

Headless Chromium, DPR 4, `/adres/0972447-29830` with every `<details>` open. Ink is the box of pixels that differ from the page background inside the svg's box. The label is 19 px Atkinson Hyperlegible Next; its baseline comes from a zero-size inline-block probe in the `<li>`, and x-height and cap height from canvas `measureText("x"/"H")`. Offset = ink centre − label centre, so + means the icon is low.

**Before** is production (`conaulicy.pl`). **After** is the same production page with each bin's shape attributes set to this branch's `BIN` values, which is exactly what `WasteMark` renders now. The Vercel preview needs a Vercel login, so headless Chromium cannot open it.

| width | size | bin | ink L / R / T / B, before | after | vs x-height centre, before → after | vs cap-height centre, before → after |
|---|---|---|---|---|---|---|
| 375 | 48 | bio | 2 / 2.5 / 7 / 1 | 2.25 / 2.25 / 4 / 4 | +2.99 → **−0.01** | +4.63 → +1.63 |
| 375 | 40 | zmieszane (outlined) | 0.75 / 1.25 / 5.25 / 0.25 | 1 / 1 / 2.75 / 2.75 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 375 | 40 | popiół | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 375 | 40 | bio | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 375 | 40 | papier | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 375 | 40 | plastik-metale (outlined) | 0.75 / 1.25 / 5.25 / 0.25 | 1 / 1 / 2.75 / 2.75 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 375 | 40 | szkło | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 48 | bio | 2 / 2.5 / 7 / 1 | 2.25 / 2.25 / 4 / 4 | +2.99 → **−0.01** | +4.63 → +1.63 |
| 1280 | 40 | zmieszane (outlined) | 0.75 / 1.25 / 5.25 / 0.25 | 1 / 1 / 2.75 / 2.75 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 40 | popiół | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 40 | bio | 1.5 / 2 / 6 / 1 | 1.75 / 1.75 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 40 | papier | 2 / 1.5 / 6 / 1 | 2.25 / 1.25 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 40 | plastik-metale (outlined) | 1.25 / 0.75 / 5.25 / 0.25 | 1.5 / 0.5 / 2.75 / 2.75 | +2.49 → **−0.01** | +4.13 → +1.63 |
| 1280 | 40 | szkło | 2 / 1.5 / 6 / 1 | 2.25 / 1.25 / 3.5 / 3.5 | +2.49 → **−0.01** | +4.13 → +1.63 |

- Rows measure to 0.25 px, the DPR 4 raster step. 48 px icons draw at a scale of 1.2 (the 34 px width leaves 0.2 px on each side).
- **Box centring alone was enough.** The svg's box centre was already −0.01 px from the label's x-height centre, before and after, so only the artwork was off. No CSS change.
- **Cap height:** the ink centre is now 1.63 px below the label's cap-height centre at both sizes. That gap is half the difference between cap height and x-height; `vertical-align: middle` aims at the x-height.
- **1280 lower list (papier, plastik-metale, szkło), 0.5 px left/right:** those svg boxes start at x = 386.5 px, and Chrome paints them on a whole CSS pixel. The offset is the same 0.5 px before and after, and the artwork itself is symmetric.
- **No layout shift:** page height is unchanged (2754 px at 375, 2374 px at 1280, every `<details>` open), and so are the svg width, height and viewBox. `aria-hidden` is unchanged.

Crops (`<li>`, DPR 4): `docs/tasks/task-80/before-<width>-<size>-<bin>.png` and `after-…`.
