# Task 79: PDF header bands and layout fixes

Draft PR, one branch (`ui/79-pdf-header`), only `web/app/adres/[id]/harmonogram.pdf/route.ts` and this brief (plus before/after PNGs in `docs/tasks/task-79/`). No drive-by changes, no database, no `next build/start/dev` locally.

## Context

Since task 78 the site header is GOV.UK's black Generic header with a **white** "ul." plate. The PDF still draws the amber plate and an amber "Twój dzień odbioru" line on its black bands.

## Jakub's decisions

1. **Logo:** the PDF band's plate is white on black, as on the site; the cut-out "ul." and rim show the black. Never amber in the header. Keep the amber constant only if something else still uses it, otherwise say so.
2. **Page 1 band:** equal padding on all four sides. Today the "Zeskanuj: aktualne terminy" caption nearly touches the band's bottom edge.
3. **Page 2 band (and later pages):** the same padding rule, content visually centred vertically (today it sits high). Both bands consistent.
4. **"Inny dzień niż <dzień>"** (day-cell highlight and key swatch, black today): GOV.UK red from govuk-frontend 6.5.1 with white text, contrast ≥ 4.5:1. Keep the weekday text (e.g. "śr") so it works in black-and-white print. Check whether the website has an equivalent marker; report, do not change the site here.
5. **Warning text:** "Gdyby coś się nie zgadzało, rację ma harmonogram gminy." appears twice (heading and note). Keep it once; propose which; warm, neighbourly tone.
6. **Highlighted day cell** ("23 śr") nearly touches the marks in the Odpady column: give it the same gap as other rows.
7. **Page 2 text version:** list items are smaller and lighter than the rest, while the "2027: …" line is larger and bold. Make the hierarchy consistent with the site's type scale.

## Plan

- One padding for both bands: `MARGIN` (28 pt, 10 mm), the page's own side margin, measured to the ink: the plate's and QR box's edges, text cap height at the top, descenders at the bottom (Atkinson Hyperlegible Next: ascender 0.984 em, cap height 0.668 em, descenders about 0.2 em).
- The same logo size (24 pt) in both bands.
- Page 1: logo and QR box at the top padding; caption under the QR box; band height from whichever column ends lower. "Twój dzień odbioru" in white bold.
- Later pages: the text line anchored to the bottom padding; continued calendar pages start below the new band height.
- "Inny dzień" cell: GOV.UK red `#ca3535` (`govuk-colour("red")`, 6.5.1); the highlight hugs its text with equal inner padding, so it keeps clear of the marks (see Result).
- Warning: proposal below.
- Text version: GOV.UK's scale: month headings `heading-m` (24 px), list items and every other line `body` (19 px); the "2027:" line as on page 1: bold year, regular text.

## Rendering without a database

A scratch script (not committed) bundles the route with esbuild, aliasing `@/lib/schedule` to a stub whose `getPlace` returns a fixture built from the production PDF's own text version (dates, fractions, source, `today` 2026-10-24), and calls `GET`. The `origin/main` route rendered this way is pixel-identical to the production PDF at 144 dpi, so "before" is production.

## Result

### Band paddings (pt, ink, measured on 144 dpi renders)

| | band height | top | bottom | left | right |
|---|---|---|---|---|---|
| page 1, production | 151 | 18 | 9.5 | 28 | 28 |
| page 1, this PR | 178.5 | 28 | 28.5 | 28 | 28 |
| page 2, production | 68 | 14 | 9–9.5 | 28 | n/a |
| page 2, this PR | 111 | 28 | 28–28.5 | 28 | n/a |

Same for both addresses. The 0.5 pt is the descender of "j" ("Zeskanuj", "Maja") at the raster's rounding. The bands are taller: page 1 by 27.5 pt, later pages by 43 pt. With the 19 px list (item 7), a synthetic full year goes from 5 to 6 pages: the calendar stays at 3, the text version takes 3 instead of 2.

### "Inny dzień" cell

- GOV.UK red `#ca3535` (govuk-frontend 6.5.1 `govuk-colour("red")`), white bold text: **5.16 : 1** (AA for text). Against the white page: 5.16 : 1 (non-text ≥ 3). The weekday stays ("23 śr").
- Gap from the cell to the first mark: **5.5 pt → 18.5–20 pt**. For comparison: "Dzień" to "Odpady" in the header row is 24 pt; a plain row's date to its marks is about 40 pt.
- **Clash:** "Termin przesunięty" was already `#ca3535` (GOV.UK's error colour is the same red). Both markers now look the same. The importer writes `shiftedFrom: null` today, so production never shows the moved marker; only the CI fixture does. Needs a decision before moved dates arrive.
- **Website:** no equivalent marker. Every date in the list shows its weekday in full (`spokenDay`), and `shiftedFrom` is not shown anywhere on the site.

### Warning text (proposal, implemented)

The sentence stays **once, in the note**: the bold line is "Terminy mogą się zmienić.", and the note says why and what to do: "Te daty odczytaliśmy automatycznie … i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma harmonogram gminy." That is the same wording the street page shows (`UNVERIFIED_NOTE`, shared), and the advice comes right after its reason. A verified place has no note, so its bold line keeps the full sentence.

### Logo

The plate is white in both bands, with the "ul." and rim cut out to the black; "Twój dzień odbioru" is white bold. Nothing in the PDF uses amber any more. The `plate` entry in `web/app/_palette.scss` (`#ffb547`) is now unused by code, and its comment ("for dark bars such as the PDF's") is out of date; `docs/brand.md` and `design/` also still describe the amber header plate. Not changed here (no drive-by).

### Text version

Month headings 24 px bold (heading-m, like the calendar's month captions), list items and every other line 19 px (body), the "2027:" line as on page 1: bold year, regular text.

### PNGs

`docs/tasks/task-79/`: `<id>-page<1|2>-before-production.png` (the production PDF) and `<id>-page<1|2>-after.png`, for `/adres/0972447-29830` (ul. 3-go Maja, Wednesday 23 December) and `/adres/0972447-12740` (ul. Adama Mickiewicza, Wednesday 30 December).

## Addition: the Warning text "!" centred

The "!" sat low in its circle. It was placed by its advance width and a guessed `warnD * 0.1` top. Now its ink box is centred on the circle, using the font's metrics (the same method as the logo wordmark's shift). In Atkinson Hyperlegible Next Bold, the "!" is symmetric in its advance (ink 60–243 of 303), so horizontally it was already centred. Vertically, its ink runs from the cap height (0.668 em) to 0.012 em below the baseline, 0.68 em in all.

Measured at 600 dpi on page 1 (ink-box centre minus circle centre, pt; the circle is 26.28 pt, the "!" ink 3.48 × 12.84 pt):

| | dx | dy |
|---|---|---|
| production, both addresses | −0.12 | **+1.92** (low) |
| task 79 before this fix | −0.12 | +1.80 |
| this fix, both addresses | −0.12 | −0.12 |

−0.12 pt is one 600-dpi pixel, the measurement's own rounding (it shows on both axes). Close-ups: `docs/tasks/task-79/<id>-warning-icon-before-production.png` and `<id>-warning-icon-after.png`.

## Addition: symmetric spacing (independent pixel audit)

Every gap is now set from the ink of the actual text. `inkOf()` reads the glyph boxes of the embedded font (PDFKit keeps it as `_font.font`), so each line's real ascenders and descenders count, not a guess. Changes:

1. **Page 1 band:** the usual day and the caption share one baseline, the lower of the two natural ones. The band ends `MARGIN` below the deeper descender of the two lines.
2. **Warning panel:** 12 pt above the circle and 12 pt below the last line's ink (or the circle's, when there are no notes).
3. **Table:** each date's digits are centred in the row by their ink, as the marks are. The red cell (2 pt in from each rule) is centred too, so its inner padding is even. "Dzień" starts at the same 3 pt inset as the dates (`inset`, the red cell's inner padding).
4. **Legend:** the red swatch is as wide as a mark (13 pt), so its label is as far away as the others.
5. **Footer:** one leading for every line (`small × 1.3 + 2`; the URL keeps that baseline even when set smaller). The divider has 8 pt to the ink on both sides; the key note above is placed from it. The closing line's ink ends 28 pt above the page edge.
6. **Page 2:** one leading for all 19 px text (`lineGap` 2, 20.5 pt): paragraphs, list items and wrapped lines.

Measured on page 1 (and page 2 for items 5–6) of both addresses: ink, pt, 288 dpi, so ±0.25 pt is one pixel. "Before" is the previous commit (`93084a2`).

| item | before | after |
|---|---|---|
| 1 band: left column ink to band bottom | 35.0–35.25 | **28.0** |
| 1 band: caption ink to band bottom | 28.5 | 28.25–28.5 (its "j" is shallower than the day line's; it shares the day line's baseline) |
| 1 band: day baseline / caption baseline | 141.0 / 148.0 | **148.0 / 148.0** |
| 1 band: top / left / right | 28 / 28 / 28 | 28 / 28 / 28 |
| 2 warning: above circle / below last ink | 12.0 / 14.0 | **12.0 / 12.0–12.25** |
| 3 rows: rule to digit top / digit bottom to rule | 8.0–8.5 / 6.0–6.25 | **7.0–7.25 / 7.25–7.5** (marks: 6.5 / 6.5) |
| 3 red cell: inner left / right | 3.5 / 3.5 | 3.5 / 3.5 |
| 3 red cell: above / below digits | 6.5 / 4.5 | **5.5 / 5.5** ("23 śr"); 5.25 / 5.75 ("30 śr": round digits overshoot) |
| 3 "Dzień" / dates from column edge | +0.5 / +3.0–3.25 | **+3.5 / +3.0–3.25** (the same 3 pt inset; the rest is each glyph's side bearing) |
| 4 legend: red swatch to label | 4.75 | **5.75** (marks 4.5–6.0, by shape and first letter; left alone as agreed) |
| 5 footer: divider, above / below | 7.0 / 8.75 | **8.25 / 7.75**; at 1200 dpi **8.10 / 7.98** (was 7.14 / 9.06) |
| 5 footer: baseline steps | 17.75, 17.0 | **17.5, 17.5** |
| 5 footer: bottom margin | 29.5 | **28.25** |
| 6 page 2: intro / list item / wrapped line steps | 20.5 / 19.5 / 18.5 | **20.5 / 20.5 / 20.5** |
| warning "!" centre offset dx / dy (600 dpi) | −0.12 / −0.12 | −0.12 / 0.00 (one 600-dpi pixel at most) |

Page 1 band: 178.5 pt (unchanged for ul. Adama Mickiewicza; 178.25 for ul. 3-go Maja). Page 2 band: 110.5–111. A synthetic full year is still 6 pages. The after-PNGs and icon close-ups in `docs/tasks/task-79/` are re-rendered from this commit.
