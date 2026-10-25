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
- `/smieci`: „Harmonogram do druku (PDF)” between the calendar block and the pickup list. Existing before task 125.
- `/woda`: when the gmina's posts were last read over an hour ago, an inset with the stale note (`staleNote`, `web/lib/water-module.ts`) between the checked line and the calendar block. Existing before task 125.
- `/woda` with no cut here: no AI-read note and no source inset; the empty text links the gmina's news itself (`waterEmpty`).

## Site-wide: the same job, the same component

Across the whole site the same job always uses the same component and style:

- one button style per action (adding to a calendar: the primary `govuk-button`, `CalendarBlock`);
- one alert component (the hub's alert slot, `AlertSlot` in `web/components/hub.tsx`);
- one freshness line (`CheckedLine`).

## The hub, `/adres/<id>`

The hub keeps its own layout (`web/components/hub.tsx`): the shared alert slot under the h1, one summary card per module, „Bez zapowiedzi”, and no calendar button.

## Deviations

Any deviation from this page needs Jakub's OK and is recorded here, under the section it changes.
