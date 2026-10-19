# UI patterns to copy from UK councils and GOV.UK (conaulicy.pl)

For the coding agent. Every pattern below has a source URL. Polish copy is an example; take real values (times, sources, dates) from the data and never hard-code them. Tokens are in `tokens.md`. The PDF section replaces any earlier `@media print` plan.

## 1. GOV.UK Design System

| Pattern | What to copy | Why (age / a11y) | Our version | Don't copy |
|---|---|---|---|---|
| **Address lookup** ([patterns/addresses](https://design-system.service.gov.uk/patterns/addresses/)) | Accept input in any case, with or without spaces, and ignore punctuation instead of rejecting it. Always offer a manual fallback for addresses that are missing. | Older users type inexactly. A rejected search feels like their mistake. | Normalise the query: lowercase, strip diacritics (`zrodlana` → Źródlana), drop the `ul.`/`al.`/`os.` prefix, collapse spaces. Fallback link: „Nie ma Twojej ulicy? Daj nam znać”. | UPRN/OS Places do not apply to us. Skip the multi-field address form: we need one field. |
| **One thing per page** ([service-manual/form-structure](https://www.gov.uk/service-manual/design/form-structure)) | Each page holds one question, decision or piece of information. | Helps people "understand what you're asking", use mobile, and recover from errors. | Home page = one question as the h1/label: „Na jakiej ulicy mieszkasz?”. The street page answers one question: when is the next pickup. | |
| **Type scale** ([styles/type-scale](https://design-system.service.gov.uk/styles/type-scale/)) | Body text is **19px on every screen size**. Line heights are multiples of 5px. Output in rem. | Large body text without zooming; the rem output survives browser text resizing. | body 19/25; small 16/20 (as small as we go); h1 32/35 on mobile and 48/50 above 640px; h2 27/30 → 36/40; h3 21/25 → 24/30. | Don't go below 16px anywhere, including chips and the footer. |
| **Focus states** ([get-started/focus-states](https://design-system.service.gov.uk/get-started/focus-states/)) | Focus is strong: links get a filled yellow background plus a thick dark bottom border; inputs get a yellow outline plus a thicker border. Built to meet WCAG 2.2 SC 1.4.11 on any background. | Keyboard and switch users, and anyone who loses the cursor. | Use the `focus` token (dark `#ffdda0`, light `#6b3d00`): `outline: 3px solid` + `outline-offset: 0` + a thicker field border. Links get a background fill with a 3px bottom border. Use `:focus-visible`. | Don't copy GOV.UK's literal yellow; keep our token, which passes in both themes. |
| **Buttons** ([components/button](https://design-system.service.gov.uk/components/button/)) | Sentence case, verb-first, **one primary button per page**. Avoid disabled buttons (poor contrast, confusing). Don't rely on colour alone. | A single obvious next step. | „Pokaż terminy”, „Dodaj do kalendarza”, „Pobierz harmonogram (PDF)”. Primary = accent; the others are secondary. | GOV.UK's research found green start buttons raised click-through. Don't import green: it clashes with the glass colour. |
| **Print/hide utilities** ([styles/layout](https://design-system.service.gov.uk/styles/layout/)) | `govuk-!-display-none-print` | | Only for the tiny HTML fallback in §4. | |
| **Content style** ([style-guide/a-to-z](https://www.gov.uk/guidance/style-guide/a-to-z)) | Active voice; check any sentence over 25 words; no FAQs; no block capitals; no italics; bold only sparingly; dates like "2 June" (no ordinals); "to" for ranges, not dashes; say "select", never "click"; don't use "please"/"please note". | Plain language works for every age and for screen readers. | „czwartek, 22 października” (no „22.10.” in body text); „od 1 do 15 listopada”; „Wybierz ulicę” (never „Kliknij”); „Wystaw pojemnik do {godzina z harmonogramu}”. | |

**Don't copy from GOV.UK:** the heavy black/blue full-width header bar with a crest, or the institutional tone. Our site is a neighbourly, unofficial helper, so keep the header light: the wordmark and a theme toggle.

## 2. Wigan (best overall reference)

Sources: [My bin collection](https://www.wigan.gov.uk/Resident/Bins-Recycling/My-Bin-Collection/index.aspx), [My Neighbourhood postcode search](https://apps.wigan.gov.uk/myneighbourhood/Search.aspx), and the PDF calendar ([THUCCG.pdf](https://apps.wigan.gov.uk/MyNeighbourhood/Calendars/THUCCG.pdf?id=55066); local copy `inspiration/wigan-cal.pdf`, `page-*.png`).

- **Collection-day headline.** The PDF opens with "Your collection day is Thursday" in about 30pt, before anything else. Ours: „Najbliższy odbiór: **jutro, czwartek 22 października** – zmieszane”. Use „Twój dzień odbioru to czwartek” *only* when every fraction for that street falls on the same weekday. Don't invent it otherwise.
- **Shape + colour per bin.** Key: brown ■ square, blue ▲ triangle, green ★ star, black ● circle. It still reads on a black-and-white printer and for colour-blind users. Our mapping is in §4.
- **Holiday shift highlight.** Moved dates (23 Dec, 30 Dec, 24 Mar) get a red cell. **Don't copy as-is:** the red has no legend entry on the grid page, and only the text version says "(Wednesday)". Ours: thick outline + „!” marker in the cell, a legend entry „! – termin przesunięty”, and the reason in the footer list.
- **A4 month grid.** The PDF fits 18 months on one A4 page as small "Date | Bin" tables, 6 per row, grouped under year headings. Copy the layout; drop the dense bordered tables (see §4).
- **Notices with icons.** Three short notices sit next to icons: "Important", a clock showing 6:00 ("put bins out by 6:00am"), and "Your collection day may have changed" next to a **QR "SCAN ME"** that goes back to the website.
- **Text-only accessible version.** The grid page links to a text list ("15 October: Black Bin & Green Bin…", page 2). Ours: our street web page *is* the text version. The PDF links to it and carries a tag structure (§4).
- **Don't copy:** Wigan's own PDF contradicts itself, saying "by 6:30am" and "by 6:00am" for the same thing. Generate every piece of copy from one data field. Also skip the full-width blue banner header.

## 3. Other UK councils (all verified live, Oct 2026)

- **Bristol** ([collection-day finder](https://waste.bristol.gov.uk/), [dates page](https://www.bristol.gov.uk/residents/bins-and-recycling/bins-and-recycling-collection-dates)). The flow is postcode → "Choose an address" → dates, plus "download the collection calendar for your property". Its error messages are specific and kind: "Postcode not valid. Check you've entered it correctly." and "We couldn't find that postcode in the Bristol City Council area." It also has a plain "Get help putting bins out" phone line. Ours: „Nie znaleźliśmy ulicy „{q}” w Lubaczowie ani w gminie. Sprawdź pisownię albo wpisz początek nazwy.”
- **Leeds** ([check your bin day](https://www.leeds.gov.uk/bins-and-recycling/check-your-bin-day)). It has report links next to the results, "Collection days not showing or incorrect" and "Address not displaying", and offers app reminders. It publishes the data openly ([data.gov.uk](https://www.data.gov.uk/dataset/c653b18d-40d6-4324-982a-eb31182189fc/household-waste-collections)). Ours: put „Coś się nie zgadza? Zgłoś błąd” under every schedule. **Don't copy:** Leeds currently shows a banner, "house numbers not displaying in order… scroll all the way down". Sort house numbers naturally (2 < 10 < 10a).
- **Manchester** ([reminders](https://www.manchester.gov.uk/bins-rubbish-and-recycling/get-bin-reminders-and-latest-information), [current issues](https://www.manchester.gov.uk/bins-rubbish-and-recycling/current-bin-collection-issues)). The issues page is plain and dated (for example, a heat-wave collection from 6am). It includes neighbourly copy: "Please let any friends, family, or neighbours without internet access know." That fits our tone, and the PDF is the tool for it: „Wydrukuj i przekaż sąsiadowi, który nie korzysta z internetu.” **Don't copy:** the old URL now says only "This service has moved". Keep our street URLs permanent, because they are printed on paper in the QR code.

## 4. Printable schedule: server-side PDF (replaces @media print)

**Route.** `GET /{gmina}/{ulica}/harmonogram.pdf` is a Next 16 Route Handler with `runtime = 'nodejs'` and zero client JS; the street page links to it with a normal `<a download>`.
- **Caching:** cache it on the CDN with the same revalidation and tags as the address page, so it regenerates when the data changes.
- **Headers:** `Content-Type: application/pdf` and `Content-Disposition: inline; filename="harmonogram-{ulica}-{gmina}.pdf"` (ASCII slug).
- **Rate limit:** put it under the planned WAF rate-limit rule.

**Library comparison**

| Option | Cold start / speed | Size | Polish + font embed | Tagged / accessible PDF |
|---|---|---|---|---|
| **PDFKit** `pdfkit@0.20.2` ([accessibility docs](https://pdfkit.org/docs/accessibility.html)) | Pure JS, no browser. **Measured on our box: 53 ms**, 10 KB file for one A4 page. | npm unpacked about 10.5 MB, mostly the bundled AFM files | **Measured:** Atkinson Next Regular TTF embedded as a subset (`CID TrueType, Identity-H, emb/sub/uni = yes`); `pdftotext` returns „Zażółć gęślą jaźń… Źródlana” correctly | **Yes**: `tagged: true`, `subset: 'PDF/UA'`, `lang`, `displayTitle`, a structure tree (H1/P/L/Table), `Artifact` for decoration. `pdfinfo` reports `Tagged: yes`. |
| `@react-pdf/renderer@4.9.0` | Pure JS; JSX + flexbox layout (Yoga) | Small package, with pdfkit-fork and layout dependencies | Yes, via `Font.register` (TTF) | **No.** Issue [#3179 "WCAG / Pdf-Tagging"](https://github.com/diegomura/react-pdf/issues/3179) is open; output is untagged. Works in route handlers through `renderToBuffer` ([Next serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)). |
| `pdf-lib@1.17.1` | Pure JS, fast, low-level (you position everything yourself) | about 19 MB unpacked; last release May 2022 | Through `@pdf-lib/fontkit` 1.1.1, which has known subsetting glyph-loss bugs ([#1232](https://github.com/Hopding/pdf-lib/issues/1232)) | No |
| Headless Chromium: `puppeteer-core` + `@sparticuz/chromium@153` | Cold start about 1.3–2.7 s ([pdf4.dev](https://pdf4.dev/blog/pdf-generation-serverless-environments)) and 5–6 s in the maintainer's Lambda logs ([Sparticuz#79](https://github.com/Sparticuz/chromium/issues/79)); needs ≥1 GB RAM | About 70 MB npm, about 150 MB decompressed to /tmp; close to Vercel's 250 MB function limit | Yes, as web fonts | Yes: `page.pdf({tagged: true})` is the default since Puppeteer 22 ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)). Lets us reuse HTML/Tailwind. |

**Recommendation: PDFKit, used directly.** It is the only pure-JS option that produces tagged PDF/UA. It embeds and subsets our font correctly for Polish and needs no browser binary or cold-start penalty. A fixed one-page layout is easy to position by hand. Chromium is the fallback only if hand layout becomes painful; with CDN caching its cold start would be rare, but it costs about 150 MB and RAM. Avoid @react-pdf (no tagging) and pdf-lib (stale; font bugs).
- **Font:** self-host the static TTFs `AtkinsonHyperlegibleNext-{Regular,Bold}.ttf` from [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) (`fonts/ttf/`, OFL 1.1; ship the OFL licence too). Don't use the variable font; don't fetch fonts at runtime.
- **Bundling:** read the font with `fs` and include it in the function through `outputFileTracingIncludes`. Add `pdfkit` to `serverExternalPackages` if Next doesn't already externalise it; pdfkit reads its own data files from `__dirname`.
- **QR:** build a matrix with `qrcode` (`QRCode.create(url)`) and draw it as filled squares, so it is vector and sharp. Mark it as an Artifact; the URL is also printed as text.

**Page layout (A4 portrait, one page, 12 mm margins, white background, light-mode tokens, colours chosen to survive B/W printing)**
1. **Header (left):** „Harmonogram odbioru odpadów”, 14pt, then the street name, Bold 26pt („ul. Źródlana, Lubaczów”), then the period („od października 2026 do marca 2027”, taken from the data). **Header (right):** a 25 mm QR code to `https://conaulicy.pl/{gmina}/{ulica}`, captioned „Zeskanuj – aktualne terminy”. No orange header band; keep the accent to a thin rule.
2. **Notice line, 11pt:** „Wystaw pojemniki do {godzina z danych} w dniu odbioru.” Print it only if the data has a time.
3. **Month grid:** the remaining months of the season, from the current month to the end of the data, at most 12. Use 3 columns × up to 4 rows; 6 columns, as Wigan does, only above 12 months. Each month box has the month name in Bold 12pt, then one row per pickup: date in Bold 12pt tabular figures („22 pt”) and shape icons (5 mm) with short labels. Never use text under 9pt. Skip past months.
4. **Legend:** one row of shape, colour and Polish name, using the mapping below.
5. **Footer, 9pt:** „Źródło: {nazwa i adres źródła z danych} · Stan na {data aktualizacji} · Serwis nieoficjalny i bezpłatny – w razie wątpliwości sprawdź u źródła.” Add the shifted-date list as „! {nowa data} zamiast {stara data} – {powód}” (from the data) and „Wydrukuj i przekaż sąsiadowi.”

**Shape mapping:** distinct silhouettes; colours from `tokens.md`, light mode; every shape has a 0.75pt dark stroke so the yellow stays visible.

| Fraction | Colour (token) | Shape |
|---|---|---|
| zmieszane | grey `#5b6575` | ● circle (Wigan's general-waste circle) |
| papier | blue `#1f63c7` | ■ square (sheet) |
| metale i tworzywa sztuczne | yellow `#7d6200` (in print: fill `#f4d35e` with dark stroke) | ▲ triangle |
| szkło | green `#1e7f4f` | ◆ diamond |
| bio | brown (light bio token) | ★ star (Wigan's green waste) |
| popiół | warm grey (light popiół token) | ⬢ hexagon |
| gabaryty, if in data | rose | ✚ plus |

**Holiday shifts:** a 2pt dark outline on the date + „!” + the footer list. Colour (danger `#b42318`) is an extra cue, never the only one.

**Accessibility (tagging):** document `lang: 'pl-PL'`, a title, and the street name as H1. Each month is a `Sect`/`H2`, and each pickup is a list item whose text is the whole sentence („22 października, czwartek: zmieszane, bio”). Shapes and the QR code are `Artifact`s. Write content in reading order. Check the result once with PAC (PDF Accessibility Checker) or `pdfinfo` (`Tagged: yes`).

**Tiny HTML fallback:** only because it is trivial, add to the global CSS
`@media print { header nav, .no-print, button { display:none } body { background:#fff; color:#000 } a[href]::after { content:none } }`.
Nothing more: the PDF is the printable product.
