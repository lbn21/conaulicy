# Layout

Every page follows one consistent layout (Jakub's decision, task 125). Read this before any UI change, and keep it up to date when a shared component changes.

## Address subpages: one skeleton

Every `/adres/<id>/<module>` page (`smieci`, `woda`, and later `prad` or any new module) has the same skeleton, in this order:

1. Breadcrumbs: `PlaceBreadcrumbs` (`web/components/place-page.tsx`, built on the shared `Breadcrumbs`, below), rendered by `ModuleMain` (`web/components/module-page.tsx`) before `<main>`; everything below is inside it.
2. Caption (place, street) + h1: `SubpageHeading` (`web/components/place-page.tsx`).
3. „Zmień adres”: part of the same heading (GOV.UK "Change" pattern).
4. „Wywozy sprawdziliśmy …” (waste), „Komunikaty o wodzie sprawdziliśmy …” (water), „Ostatnio sprawdziliśmy …” (weather): `CheckedLine` (`web/components/checked-line.tsx`), from the module's `checkedAt` (`web/lib/modules.ts`), its label per module in `web/lib/hub.ts` (`CHECKED`).
5. The calendar block: `CalendarBlock` (`web/components/subpage-parts.tsx`), a primary `govuk-button` link to the module's ICS file, a hint under it (only the page's own sentence on what the file is), then a closed `govuk-details` „Jak dodać i sprawdzić, czy się udało?” with the shared `CALENDAR_STEPS`: how to add it on an iPhone and on Android, what to check and try, and Google Calendar on a computer; a browser never knows whether the import worked, so the copy never says it did. Only the hint comes from the page; the rest, details included, lives only in the component, the same on every page. Its `event` prop and properties are what `web/components/web-analytics.tsx` sends on a click: waste `calendar_add` with `zone` and `source`, water `water_calendar_add` with `place` (the place id). Shown only when the file has at least one event (water: `waterCalendarHref`, `web/lib/water-ics.ts`; waste: a zone with upcoming dates).
6. The module's content (waste: the pickup list; water: the cuts, a day each, then „Inne komunikaty”).
7. The AI-read note: `AiReadNote` (`web/components/subpage-parts.tsx`), GOV.UK's warning text. Wording per source: `UNVERIFIED_NOTE` (`web/lib/schedule-notes.ts`) for the gmina's schedule, `waterAiNote` (`web/lib/water-module.ts`) for the water posts, naming the source of the cuts shown (the gmina's, MZGKiM's or both).
8. The source in an inset: `SourceInset` (`web/components/subpage-parts.tsx`), one „Źródło: …” paragraph per source.

With no calendar file, or nothing to show, the rest keeps the same order. New subpages reuse these shared components instead of re-creating them. `web/components/subpages.test.ts` renders `/smieci` and `/woda` and checks the order and that both calendar blocks have the same markup.

### Recorded deviations

Each needs Jakub's OK; listed here so nothing drifts silently.

- `/smieci` and the street page: GOV.UK's error summary above the caption, and the house-number note under the h1 (a number that changes nothing), both from `PlaceHeading` (`web/components/place-page.tsx`). Existing before task 125.
  Since task 126 the same note also says when the address register (PRG, `web/lib/prg.ts`) has no such number at the place, on the hub and on every subpage's house-number variant; a hint only, never shown with a split street's error.
- `/smieci`: „Harmonogram do druku (PDF)” between the calendar block and the pickup list. Existing before task 125.
- `/woda`: when a source's posts were last read over an hour ago (or, beside a cut or notice, one of the address's sources could not be read), an inset with the stale note (`staleNote`, `web/lib/water-module.ts`) between the checked line and the calendar block. Existing before task 125.
- `/woda` with no cut here: no AI-read note and no source inset; the empty text links each source's news itself (`waterEmpty`: the gmina's; in the town MZGKiM's too).
- `/woda` and the hub's water section: with a house number, when a cut here was left out because its houses clearly exclude that number, one `govuk-body` line after the cuts or the empty text (`waterTrace`, `web/lib/water-module.ts`; on the hub a line of `waterStatus` after the cut). Jakub's decision, task 129. On the hub, when no cut is left to show, the section says it instead („Pod nr N: …” and the left-out cut with its day, `waterStatus`), and no trace line follows (task 188).

## Breadcrumbs

One component, `Breadcrumbs` (`web/components/breadcrumbs.tsx`), GOV.UK's breadcrumbs: every item a link, the page itself left out, `aria-label` „Ścieżka nawigacyjna”.

- Only on the address pages (`/adres/<id>` and its subpages): „Strona główna”, the locality, and on a module's subpage the address page (`PlaceBreadcrumbs`, `web/components/place-page.tsx`).
- None anywhere else: `/szukaj`, `/o-projekcie`, `/prywatnosc`, `/dostepnosc`, `/ulice`, the home page and the 404. GOV.UK: „Do not use the breadcrumbs component on websites with a flat structure”, and the rest of the site is flat (Jakub's decision, task 149; task 146 had added „Strona główna” there).
- Before `<main>`, inside `govuk-width-container`, as GOV.UK places them: „Always place breadcrumbs at the top of a page, before the `<main>` element”, so the skip link („Przejdź do treści”, `#main-content`) skips them along with the header. So each page renders its own `<main>` (`PageMain`, `web/components/page-main.tsx`); the layout has only the container. The IMGW banner is the first thing in `<main>` on every page that has it.
- Spacing as when they were inside `<main>`: `govuk-!-margin-top-7` stands in for main's top padding, and GOV.UK's own 10 px margin-bottom plus main's padding give the 30/50 px gap to the h1. GOV.UK's spacing scale has no 20/40 px step, so on mobile they sit 5 px lower than before (25 px under the header, not 20); identical from tablet up.

`web/components/breadcrumbs.test.ts` renders the component and the address page's frame; `web/scripts/check-modules.mjs` checks the crumbs and their place in each page's HTML; `web/scripts/check-warnings.mjs` checks on every route that they appear only on address pages, right before `<main>`.

## Titles

GOV.UK's title is the page's h1, then „ – conaulicy.pl”. A place's pages add its locality to the title only, never to the h1, so that search results for the same street name in two places differ (Jakub's decision, task 133): the hub „ul. Leśna, Lubaczów – conaulicy.pl”, a village's street „ul. Leśna, Basznia Dolna – conaulicy.pl”, a whole village „Antoniki, gm. Lubaczów – conaulicy.pl”; `/smieci` „Odbiór śmieci: wszystkie terminy – ul. Leśna, Lubaczów – conaulicy.pl”, `/woda` „Przerwy w dostawie wody – ul. Leśna, Lubaczów – conaulicy.pl”. Built from the place's label (`titleLabel`, `web/lib/places.ts`); `web/scripts/check-metadata.mjs` checks the pattern, `check-indexing.mjs` that no two titles in the sitemap are the same.

## Headings

- One h1 per page.
- Module and section headings are h2 (on the hub `govuk-heading-l`, on other pages `govuk-heading-m`); no skipped levels.
- When a list needs a section heading for screen readers but not on screen, it gets a visually hidden h2 (`govuk-visually-hidden`), as the pickup list on `/smieci` (`web/components/pickup-schedule.tsx`).
- `web/scripts/check-modules.mjs` guards the hub's outline (h1, then h2, no h3, no skips).

## Indexing

- Indexed, and in the sitemap (`web/app/sitemap.ts`): the static pages, and for each place with data its hub and `/smieci`.
- `noindex` and not in the sitemap: `/woda` (its content lasts days and is mostly empty; it stays so), the house-number variants (`?nr=`, `/nr/…`, canonical to the hub), `/numer`, `/szukaj`, PDFs, ICS files, and places with no data.
- `web/scripts/check-indexing.mjs` checks both lists, and that every URL in the sitemap is indexable (200, no noindex, canonical itself).

## Site-wide: the same job, the same component

Across the whole site the same job always uses the same component and style:

- one button style per action (adding to a calendar: the primary `govuk-button`, `CalendarBlock`);
- one place for what is coming soon (the hub's „Najbliższe dni”, `Upcoming` in `web/components/upcoming.tsx`): a line per item, „Szczegóły i źródło” to its section's anchor, where its source and check time are (task 207);
- one freshness line: `CheckedLine` on the subpages; on the hub, the end of each section's meta line („Sprawdziliśmy …”, `metaLine`, `web/lib/hub.ts`).
- Link text says where it goes (e.g. „Wszystkie odbiory śmieci”); never a bare „Szczegóły” or „Kliknij tutaj” (`web/scripts/check-modules.mjs` fails on one).

## Home-screen app

Opened from the home screen (`display-mode: standalone`), every page has a strip in the header's colour, 10 px deep, fixed at the top (`.govuk-template__body::before`, `web/app/site.scss`; task 136): Safari 26 takes the status bar's colour from it, not from theme-color. It is the only own fixed element, sits on the header's own colour when the page is not scrolled, and is hidden while the skip link is focused. In a browser tab nothing changes. The status bar style is `default`, never `black-translucent` (`web/app/layout.tsx`).

## The hub, `/adres/<id>`

The hub keeps its own layout (`web/components/hub.tsx`): „Najbliższe dni” under „Zmień adres” when something is shown, then one section per module, always, in registry order: Śmieci, Woda, Pogoda (`MODULE_IDS`, `web/lib/address-routes.ts`; task 207), each with its module's id as its anchor (`<section id="woda">`). A module left out only when it has nothing we may show (the weather when IMGW's copy is missing or 3 hours old).

„Najbliższe dni” (`web/components/upcoming.tsx`, a client island; its rules in `web/lib/upcoming.ts`): h2 `govuk-heading-m`, then a `govuk-list govuk-list--spaced`, then a visible `govuk-section-break--l`. Each module gives structured items (`Module.upcoming`): water cuts and IMGW warnings while announced and not over (no end: until the end of its day), pickups only today and tomorrow, „Wystaw je …” only before its time. One order: start, then end, then `MODULE_IDS`; no priority by module or level. Each item: the lead word in `<strong>` („Teraz”, „Dziś”, „Jutro” or its date) and the sentence (IMGW's level as its tag); its second sentence on its own line (where, from structured fields only, never the source's `note`; or when to put the bins out). A whole locality is „wieś” or „miejscowość” by its TERYT kind (`placeWord`, `web/lib/water-module.ts`), the same word as the Woda section's „Gdzie”; a failure reads „(awaria)” after what happens, whatever the lead; then „Szczegóły i źródło” with a visually hidden „: woda / pogoda / odbiór śmieci”, to the section's anchor, where the source and check time are. Nothing shown: no heading, no list, no break. The island hydrates with the server's render time, then follows the device's clock (every minute and when the tab comes back), keeping the server's words when the clock is over 5 minutes before the render; all labels are made on the server, all comparisons are Warsaw days and instants.

Each section, in this order:

1. h2 `govuk-heading-l`, the module's title.
2. Its status (`Module.status`, `web/lib/modules.ts`): groups of lines, never empty. Each line a `govuk-body` paragraph (a row of bins: a `div`); lines of a group close under each other (`govuk-!-margin-bottom-2`), the group's last keeps the paragraph's gap. Dates absolute in the HTML („środa, 4 listopada”); a section's first date line gets its lead from the same island (`DayLead`): „Dziś: ”, „Jutro: ”, „Za N dni: ” for 2 to 7 days, beyond that the date alone, capitalised. A label with a colon („Gdzie: …”, „Kolejne dni: …”) ends without a full stop, as its value may end in the source's own words.
   - Śmieci: the next pickup's day; „Tego dnia odbiorą:”, or „Tego dnia odbiorą wszystkie pojemniki:” when that day has every fraction the zone has (all its events, past ones too; more than one); its bins in a row (`Bins` size `small`: 14×20 marks, GOV.UK's `govuk-!-display-inline-block` and `govuk-!-margin-right-3` / `-1`, no own CSS); „Wystaw je do 6:00 rano.” when the data has a time (`putOutLine`, `web/lib/schedule-notes.ts`). Or the split street's question, or why there are no dates.
   - Woda: the nearest cut's day and hours, „Gdzie: …”; the parent village's hint, „Kolejne dni: …”, the trace, notices and the stale note, each a group of its own. Nothing: „Brak zapowiedzianych przerw.” (or that we could not check, `waterNone`).
   - Pogoda: per warning, its event and level (its tag), then its day and hours; then „Gdzie: cały powiat lubaczowski”, together. Nothing: „Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.”
3. A text link to the module's subpage saying where it goes (its `more`, e.g. „Wszystkie odbiory śmieci”); none for a module without a subpage (the weather: its source is IMGW's own page), nor while the module has no source here (a place with no schedule: the subpage would say the same).
4. Its meta line, last, `govuk-body-s`: „Źródło: ‹its sources, joined with ;›.”, then the module's `note` (waste, dates not checked yet: „Daty przepisał program – jeśli coś się nie zgadza, ważniejszy jest harmonogram.”), then „Sprawdziliśmy 28 października, 15:52.” (`metaLine`, `web/lib/hub.ts`). Each part only when there is one: no source, no „Źródło”; nothing left, no paragraph.

A visible `govuk-section-break--l` between sections (and after „Najbliższe dni”), none after the last; no summary lists or cards on the hub (GOV.UK: summary cards are for lists of the same type of thing; Jakub's decision, task 131), no calendar button. IMGW's required wording after the sections, as secondary text.

## Deviations

Any deviation from this page needs Jakub's OK and is recorded here, under the section it changes.
