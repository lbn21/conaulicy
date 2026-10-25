# Layout

Every page follows one consistent layout (Jakub's decision, task 125). Read this before any UI change, and keep it up to date when a shared component changes.

## Address subpages: one skeleton

Every `/adres/<id>/<module>` page (`smieci`, `woda`, and later `prad` or any new module) has the same skeleton, in this order:

1. Breadcrumbs: `Breadcrumbs` (`web/components/place-page.tsx`), rendered by `ModuleMain` (`web/components/module-page.tsx`).
2. Caption (place, street) + h1: `SubpageHeading` (`web/components/place-page.tsx`).
3. „Zmień adres”: part of the same heading (GOV.UK "Change" pattern).
4. „Ostatnio sprawdziliśmy …”: `CheckedLine` (`web/components/checked-line.tsx`), from the module's `checkedAt` (`web/lib/modules.ts`).
5. The calendar block: `CalendarBlock` (`web/components/subpage-parts.tsx`), a primary `govuk-button` link to the module's ICS file and a one-line hint under it. Its `event` prop and properties are what `web/components/web-analytics.tsx` sends on a click: waste `calendar_add` with `zone` and `source`, water `water_calendar_add` with `place` (the place id). Shown only when the file has at least one event (water: `waterCalendarHref`, `web/lib/water-ics.ts`; waste: a zone with upcoming dates).
6. The module's content (waste: the pickup list; water: the cuts, a day each, then „Inne komunikaty”).
7. The AI-read note: `AiReadNote` (`web/components/subpage-parts.tsx`), GOV.UK's warning text. Wording per source: `UNVERIFIED_NOTE` (`web/lib/schedule-notes.ts`) for the gmina's schedule, `WATER_AI_NOTE` (`web/lib/water-module.ts`) for the gmina's water posts.
8. The source in an inset: `SourceInset` (`web/components/subpage-parts.tsx`), one „Źródło: …” paragraph per source.

With no calendar file, or nothing to show, the rest keeps the same order. New subpages reuse these shared components instead of re-creating them. `web/components/subpages.test.ts` renders `/smieci` and `/woda` and checks the order and that both calendar blocks have the same markup.

### Recorded deviations

Each needs Jakub's OK; listed here so nothing drifts silently.

- `/smieci` and the street page: GOV.UK's error summary above the caption, and the house-number note under the h1 (a number that changes nothing), both from `PlaceHeading` (`web/components/place-page.tsx`). Existing before task 125.
  Since task 126 the same note also says when the address register (PRG, `web/lib/prg.ts`) has no such number at the place, on the hub and on every subpage's house-number variant; a hint only, never shown with a split street's error.
- `/smieci`: „Harmonogram do druku (PDF)” between the calendar block and the pickup list. Existing before task 125.
- `/woda`: when the gmina's posts were last read over an hour ago, an inset with the stale note (`staleNote`, `web/lib/water-module.ts`) between the checked line and the calendar block. Existing before task 125.
- `/woda` with no cut here: no AI-read note and no source inset; the empty text links the gmina's news itself (`waterEmpty`).
- `/woda` and the hub's water card or „Bez zapowiedzi” line: with a house number, when a cut here was left out because its houses clearly exclude that number, one `govuk-body` line after the cuts or the empty text (`waterTrace`, `web/lib/water-module.ts`; on the hub the module's `trace`, `web/lib/modules.ts`). Jakub's decision, task 129.

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
- one alert component (the hub's alert slot, `AlertSlot` in `web/components/hub.tsx`);
- one freshness line (`CheckedLine`).
- Link text says where it goes (e.g. „Wszystkie odbiory śmieci”); never a bare „Szczegóły” or „Kliknij tutaj” (`web/scripts/check-modules.mjs` fails on one).

## The hub, `/adres/<id>`

The hub keeps its own layout (`web/components/hub.tsx`): the shared alert slot under the h1, then each module as its own section (h2 `govuk-heading-l`, a summary list, then a text link saying where it goes: its module's `more`, `web/lib/modules.ts`, e.g. „Wszystkie odbiory śmieci”), a visible `govuk-section-break--l` between sections and before „Bez zapowiedzi”; no summary cards on the hub. The hub's module summary lists use `govuk-summary-list--no-border`; the visible section break is the only line between modules; subpages keep row borders (Jakub's decision, task 132). Then „Bez zapowiedzi” (h2 `govuk-heading-l`), and no calendar button.

Jakub's decision, task 131 (GOV.UK: summary cards are for lists of the same type of thing).

## Deviations

Any deviation from this page needs Jakub's OK and is recorded here, under the section it changes.
