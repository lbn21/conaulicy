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

_To be filled in._
