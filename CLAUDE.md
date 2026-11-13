# conaulicy.pl

A free site for Lubaczów residents: type your street, see what is coming at your address, add the pickups to your calendar (ICS). Guiding principle: modern, clean, minimal, simple. This file holds the technical rules for coding agents.

## Stack

- Next.js 16 (App Router), React 19, TypeScript.
- Styling: `govuk-frontend` (Sass) only. No Tailwind, PostCSS or other CSS framework (`check-own-css` enforces it).
- Biome for lint and format (no ESLint, no Prettier).
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app; importers in `web/scripts/import.ts` and `web/scripts/import/`, `docs/import.md`; the database client and schema, the import's side only, in `web/db/`), `etl/` (config and review data, no code), `docs/`, `design/`.

## Design system: GOV.UK Frontend as-is

- **GOV.UK Frontend CSS and JS and alphagov accessible-autocomplete are used unchanged**: markup, class names, sizes, spacing, typography, focus and the page template exactly as the [GOV.UK Design System](https://design-system.service.gov.uk/).
- **Only these are ours**, because GOV.UK forbids other sites to copy them:
  - the brand colours, set only in `web/lib/palette.ts`, take GOV.UK's brand-blue roles; the rest of GOV.UK's palette is used as-is (except visited links, below);
  - the typeface: Atkinson Hyperlegible Next, self-hosted, 400/700; never GDS Transport;
  - the logo: the "ul." plate in the GOV.UK Generic header and, in one colour, in the footer (our own markup with `govuk-footer` classes); never the GOV.UK footer component, the crown, the crest, the GOV.UK logotype, the OGL, a Crown copyright line or the GOV.UK header.
- **Exceptions** (brand blue hard-coded upstream; `check-own-css` and `check-govuk-assets` enforce them):
  - `.govuk-button--inverse`: may appear in the CSS output, never in markup.
  - accessible-autocomplete's highlighted option: `site.scss` overrides its colour with the brand role.
  - the plain `.govuk-tag`: stays in the CSS output, never in markup (a tag without a colour modifier fails `check-own-css`).
- **Deviations:**
  - visited links take the link colour (`ROLE_STEPS`, `web/lib/palette.ts`); no per-link modifier classes.
  - the footer is 16px (`govuk-!-font-size-16` on `.govuk-footer`, no own CSS), as the breadcrumbs: 19 for content, 16 for metadata and chrome, bold only for headings and keys, GOV.UK's v6 scale only (`docs/layout.md`).
  - accessible-autocomplete's field, hint and suggestions are 19px at every width, as `.govuk-input` (`site.scss`).
  - running text breathes: line-height 1.5 for paragraphs, leads, lists, hints and insets (not headings, summary lists, badges or chips), and paragraphs, lists and m/s headings 20/25 px from what follows (`site.scss`; Jakub as tech lead, t332).
  - the page head's one spacing scale: a subpage's street line (`govuk-caption-l`) 10 px above its h1, not GOV.UK's 5/0 (`site.scss` `.app-band`; Jakub, t373).
  - no loading states: every page is prerendered whole (Caching, below), so no skeleton, `<Suspense>` hole or view transition anywhere; empty states are plain text (`check-reload`: CLS 0, no skeleton, no view transition).
- **Light theme only.**
- Any other deviation needs Jakub's approval and a reason in the PR.
- **Own CSS:** only `web/app/site.scss`, for what GOV.UK has no equivalent for. GOV.UK Sass functions and mixins only, no raw hex or px. CSS ≤ 2.812 KB gzip, ≤ 200 lines.
- **No CSS hacks:** align with flex, grid and GOV.UK tokens, never offsets, negative margins, tuned line-heights or raw lengths; `check-own-css` (R1-R10, `web/scripts/lib/css-lint.mjs`) fails on any without a `// css-allow <rule>: <reason>` above it, capped by `MAX_ALLOWED` (0: none left); the routes check measures alignment at 100 and 200 % text (`docs/layout.md`). `web/app/tokens.css` holds only the font's metric-matched fallback.
- **Colours have one home each:** our brand and IMGW's warning levels (`WARNING_LEVELS`) in `web/lib/palette.ts`, GOV.UK's own in `web/lib/govuk-colours.ts`, the bin colours in `web/lib/waste-colours.ts`; `check-palette` fails on a raw hex anywhere else in the site's code. Brand, palette and contrast: [docs/brand.md](docs/brand.md).

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG 2.2 AA minimum.
- Links never open in a new tab (PDF and source links included).
- **Every internal link is `next/link`, never a plain `<a>`**, a same-page `#fragment` included (`FragmentLink`, `web/components/fragment-link.tsx`): only `<Link>` adds history entries the App Router knows, so Back works. A plain `<a>` only for an external link: another site, `mailto:`, or a file the browser opens itself (ICS, PDF, `webcal:`, `/fonts/OFL.txt`); `web/components/internal-links.test.ts` fails on any other.
- **Prefetch:** Next.js's default for every `<Link>`: every page is static output, so a prefetch never runs a function (`docs/layout.md`, Navigation).
- **Pixel perfect:** paddings, margins and icon/glyph placement are symmetric and equal wherever reasonably possible (site, PDF, OG images), measured from screenshots (DPR 2-4, ±0.5 px) with before/after numbers in every UI PR. Where GOV.UK is deliberately asymmetric, flag it (the footer keeps GOV.UK's spacing).
- One thing per page: no second search box. „Zmień adres” (GOV.UK "Change" pattern) returns to the home page's search, empty, with no forced focus.
- Copy is warm, plain, everyday Polish; follow the [GOV.UK style guide](https://www.gov.uk/guidance/style-guide/a-to-z) in spirit. No gesture-only interactions and no icons without labels.
- No third-party requests (fonts, scripts, images).
- **Layout:** every page follows one consistent layout; read [docs/layout.md](docs/layout.md) before any UI change and keep it up to date when a shared component changes.

## Performance

- **Hard gates** (Slow 4G + 4× CPU): LCP ≤ 1.8 s median, TBT ≤ 150 ms, search keystroke ≤ 50 ms; CLS held to ≤ 0.1. They never move to make room for code; if one fails, report to Jakub. Checked by Lighthouse by hand, not in CI: `npm run check:perf` before bigger UI changes (`docs/perf.md`).
- **Size budgets:** first-load JS ≤ 200 KB gzip, street HTML ≤ 30 KB gzip.

## Architecture and data

- **Caching (t416):** everything is prerendered whole at `next build`: Cache Components off, `dynamic = "error"` on the root layout, `generateStaticParams` + `dynamicParams = false` on every dynamic route (pages and route handlers), so only what the build made exists and any other URL is the prerendered 404 (no function, no proxy). Only `/api/cron/zuk`, `/api/cron/import` and `/api/revalidate` run on request (`check-routes-table` fails the build's route table on any other ƒ or ◐ row). No `"use cache"`, `cacheLife`, `cacheTag`, `io()`, `connection()`, `searchParams` or per-request read anywhere (`web/lib/static-routes.test.ts`). Each page's data is one `unstable_cache` keyed by its path (`pageData`, `web/lib/page-cache.ts`), tagged `page:<path>` and its sources (`dataset`, `imgw`, `pge`, `water`); a change revalidates a tag with the "max" profile, never `{ expire: 0 }`: the zuk cron a changed source's, 65 s after its write (the Blob CDN), in `after()`; an import's `POST /api/revalidate` the dataset's; the first cron run after midnight every dataset page. Route handlers set no Cache-Control of their own (Vercel's ISR headers apply), only Content-Type and Content-Disposition. Dates are absolute, with their weekday; „Dziś”, „Jutro” are the render's Warsaw day (`web/components/page-day.tsx`), no recompute on the device.
- **Address page:** IMGW warning cards, the timeline (`web/lib/timeline.ts`), a link per subpage (`SUBPAGE_IDS`) and one small-print note; date labels from `Intl` (`web/lib/dates.ts`). No house numbers: a zone covers a whole street or locality, and a snapshot member with a house range is refused. `/podglad/imgw/<scenario>` shows IMGW's mock outside production only (none in production; `web/lib/imgw-preview.ts`). Spec: `docs/layout.md` (The hub).
- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres, Drizzle ORM (`web/db/schema.ts`, `web/drizzle/`), for the import only. No state library or CMS, and nothing built "for later".
- **Data flow: Neon is the import's alone.** The import (and the approved `db:*` runs) writes Neon, then publishes one dataset snapshot JSON to the private Blob store (a new immutable version, then the pointer; `web/scripts/lib/dataset.ts`) and calls `POST /api/revalidate` 65 s later (the Blob CDN). The site (every page, route, PDF, ICS, search, sitemap, metadata, `generateStaticParams`, every build and cron) reads only that snapshot (`web/lib/dataset.ts`, checked by `web/lib/dataset-schema.ts`), filtering by day in code (`web/lib/dataset-views.ts`). A build reads only the version its prebuild step pinned (`web/scripts/dataset-build.ts`); at run time the latest version only with the build's place set (ids, labels, renames). One decision for every publisher and each zuk cron start (`syncDataset`, `web/lib/dataset-sync.ts`): the same place set, revalidate the `dataset` tag; another, POST the Vercel Deploy Hook (`DEPLOY_HOOK_URL`), never a revalidation, at most once per place set and 6 h (`status/deploy-request.json`; missing hook: the import fails loudly, the cron logs it once per place set). Every publisher in one queue (the `dataset` concurrency group of `import.yml` and `prod-db.yml`; `db:redirect` only writes its row); with no snapshot outside production, the made-up dataset (`web/lib/dataset-fixture.ts`). No file in `web/app`, `web/components`, `web/lib` or `web/next.config.ts` imports `web/db`, Drizzle or a Postgres driver, or names a database variable (`check-runtime-db`); `check:dataset` proves the snapshot gives what the database gave. Rollback: `npm run dataset:rollback -- --to <version>` ([docs/database.md](docs/database.md#the-dataset-snapshot), [docs/import.md](docs/import.md)).
- Data never goes in git: raw sources live in a private S3 bucket (`docs/data/sources.md`; `npm run sources:pull` fills the gitignored `.cache/sources/`). CI fails if a data file is tracked (`check-tracked-data`).
- CI runs on a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`) in a throwaway local Postgres; it refuses any other database, and production never holds it.
- Local development uses only `npm run db:local` (`web/docker-compose.yml`: Postgres on 127.0.0.1 with the same fixture). No real or production data is ever copied locally: no dumps, snapshots or Neon branches.
- **Search:** a compact street and village index, one static file (`/search-index.json`, loaded on first focus, one retry, then a fixed message with the link to `/ulice`; no search API). The field is accessible-autocomplete's React build, rendered on the server; „Szukaj” or Enter decides on the device (`web/lib/search-submit.ts`). Search lives only on the home page. A query string changes no page. The schedules never ship to the client.
- Power outages: PGE PowerOutage API through the 15-min cron into Blob, as IMGW's (`docs/data/pge.md`); `PGE_API_TOKEN`, ≤ 60 req/h; shown through water's row and subpage, made generic (`OutageRow`, `OutageDetails`).
- **Street PDF:** exactly two pages for every address, one geometry whatever the data: page 1 the next six months (3 × 2 tables sized for the real data's most, 7 dates of 5 fractions, each titled with its month and year, the key for every fraction the site knows), page 2 „Co wrzucać”, both under one identical band. Nothing in its layout depends on one address's data or on which data is loaded; `check-pdf` checks every fixture address and a synthetic worst case ([docs/brand.md](docs/brand.md)).
- ICS feeds are prerendered as every page (`text/calendar; charset=utf-8`), no Cache-Control of their own.
- The data model is a generic "event at a location" (`docs/database.md`).
- **TERYT (GUS ULIC/SIMC) is the single source of truth for place and street names and types; names from gmina PDFs/schedules are mapped TO TERYT, never the other way.** The import checks TERYT and opens a review issue on any difference (`web/scripts/check-teryt.ts`). A TERYT reload never deletes a place: one gone is retired, its address kept, its replacement's build answering 308 for it, one nothing replaced a 404; places change only as reviewed in `etl/review/teryt/places.yaml`, merged first, and a new place without a waste zone blocks it (docs/import.md, „TERYT reload”).
- **Hard rule:** every data item keeps a visible link to its original source on its topic page (`source.url`); no source, no display. Freshness (Jakub, 13 Nov 2026): weather, power and water show „Bez zmian od DD.MM, HH:MM” from the source's `changedAt` (written by the cron only when its content changes) and „Sprawdzamy co 15 minut”; waste only its source line. A check time (`checkedAt`) is never rendered. The address page has one note at the bottom, with IMGW's source link.

## Forbidden

- No manual production deploys. Every merge to `main` deploys to production; `import-review/**` branches never deploy (`web/vercel.json`). The unattended import (`docs/import.md`) also changes production data without a deploy, or, with a new place set, through the Deploy Hook (`web/lib/dataset-sync.ts`): never call the hook by hand.
- No production database write (`db:migrate`, `db:import --apply`, `db:redirect --apply`), and no publish or rollback of production's snapshot by hand (`dataset:publish`, `dataset:rollback`, the import workflow's `snapshot` and `rollback`), without asking Jakub in chat and getting his explicit approval for that one run; then backup, dry run, apply, 0-change dry run, through the npm scripts, never `vercel env run` ([docs/database.md](docs/database.md#writing-to-production)).
- No force-push.
- No changes to Vercel domains, DNS or billing. Never enable paid features.
- Never touch resources outside this project.
- Never print or commit secrets (`.env*` stays out of git and out of output).
- Anything paid or destructive needs Jakub's approval.

## Workflow

- Small, focused commits with short messages.
- Tests and checks pin structure and data, never page copy: no exact headings, leads, titles or sentences, and no banned words (Jakub, PR #262). Where a test needs a page's words, it reads them from their source (`MODULES`, a function, a constant).
- `biome check`, type check and tests pass before every commit. No local `next build` or `next start`: the CI build on the PR is the build gate.
- Vercel skips a Preview build when every changed file is docs or tests; production always builds (`web/scripts/vercel-ignore.sh`).
- Opus opens draft PRs only and never merges. Tech Lead merges after Jakub's OK.
