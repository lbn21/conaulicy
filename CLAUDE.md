# conaulicy.pl

A free site for Lubaczów residents: type your street, see what is coming at your address, add the pickups to your calendar (ICS). Guiding principle: modern, clean, minimal, simple. This file holds the technical rules for coding agents.

## Stack

- Next.js 16 (App Router), React 19, TypeScript.
- Styling: `govuk-frontend` (Sass) only. No Tailwind, PostCSS or other CSS framework (`check-own-css` fails on any package, config, directive or utility class).
- Biome for lint and format. No ESLint, no Prettier.
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app; the one-off importer is `web/scripts/import.ts`, the unattended import `web/scripts/import/`: shared `core/` plus one folder per domain; see `docs/import.md`), `etl/` (config and review data, no code), `docs/`, `design/`.

## Design system: GOV.UK Frontend as-is

- **GOV.UK Frontend CSS and JS and alphagov accessible-autocomplete are used unchanged**: markup, class names, sizes, spacing, typography, focus, links, buttons, forms and the page template exactly as the [GOV.UK Design System](https://design-system.service.gov.uk/) and govuk-frontend's templates.
- **Only these are ours**, because GOV.UK forbids other sites to copy them:
  - the brand colours, set only in `web/lib/palette.ts`, take GOV.UK's brand-blue roles; the rest of GOV.UK's palette is used as-is (except visited links, below);
  - the typeface: Atkinson Hyperlegible Next, self-hosted, 400/700; never GDS Transport;
  - the logo: the "ul." plate in the GOV.UK Generic header and, in one colour, in the footer (our own markup with `govuk-footer` classes); never the GOV.UK footer component, the crown, the crest, the GOV.UK logotype, the OGL, a Crown copyright line or the GOV.UK header.
- **Exceptions** (brand blue hard-coded upstream; `check-own-css` and `check-govuk-assets` enforce them):
  - `.govuk-button--inverse`: may appear in the CSS output, never in markup.
  - accessible-autocomplete's highlighted option: stays in its CSS, `site.scss` overrides the colour with the brand role.
  - the plain `.govuk-tag`: stays in the CSS output, never in markup (a tag without a colour modifier fails `check-own-css`).
- **Deviations:**
  - visited links have no colour of their own (`link-visited` is the link colour, `ROLE_STEPS` in `web/lib/palette.ts`); no per-link modifier classes.
  - the footer is 16px (`govuk-!-font-size-16` on `.govuk-footer`, no own CSS), as the breadcrumbs: 19 for content, 16 for metadata and chrome, bold only for headings and keys, GOV.UK's v6 scale only (`docs/layout.md`).
  - accessible-autocomplete's field, hint and suggestions are 19px at every width, as `.govuk-input` (`site.scss`).
  - loading states: each live block has a skeleton with a subtle pulse and reveals with a short fade (`<ViewTransition>`), none of it under `prefers-reduced-motion`. An address page and its subpages are one block: one generic skeleton, one reveal of the page and its breadcrumbs (`web/components/place-suspense.tsx`). Empty states are plain text; skeletons show at once, no delay.
- **Light theme only.**
- Any other deviation needs Jakub's approval and a reason in the PR.
- **Own CSS:** only `web/app/site.scss`, for what GOV.UK has no equivalent for. GOV.UK Sass functions and mixins only, no raw hex or px. CSS ≤ 1.6 KB gzip, ≤ 150 lines. `web/app/tokens.css` holds only the font's metric-matched fallback.
- **Colours have one home each:** our brand and IMGW's warning levels (`WARNING_LEVELS`) in `web/lib/palette.ts`, GOV.UK's own in `web/lib/govuk-colours.ts`, the bin colours in `web/lib/waste-colours.ts`; `check-palette` fails on a raw hex anywhere else in the site's code. Brand, palette and contrast: [docs/brand.md](docs/brand.md).

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG 2.2 AA minimum.
- Links never open in a new tab (PDF and source links included).
- **Every internal link is `next/link`, never a plain `<a>`**, a same-page `#fragment` included (`FragmentLink`, `web/components/fragment-link.tsx`): only `<Link>` adds history entries the App Router knows, so Back works. A plain `<a>` only for an external link: another site, `mailto:`, or a file the browser opens itself (ICS, PDF, `webcal:`, `/fonts/OFL.txt`); `web/components/internal-links.test.ts` fails on any other.
- **Prefetch:** every prefetch is static (`ensureStatic = "prefetch"` on the root layout), except links to an address page: full prefetch on intent (`PlaceLink`: `prefetch={active ? addressPrefetch(href) : 'auto'}`), never `prefetch={true}` on first render, never to a redirect source. See `docs/layout.md` (Navigation) and `docs/perf.md`.
- **Pixel perfect:** paddings, margins and icon/glyph placement are symmetric and equal wherever reasonably possible (site, PDF, OG images). Verified by measuring ink from screenshots (DPR 2-4, about ±0.5 px), with before/after numbers in every UI PR. Where GOV.UK is deliberately asymmetric, flag it instead of silently keeping or changing it (accepted exception: the footer keeps GOV.UK's spacing).
- One thing per page: no second search box. „Zmień adres” (GOV.UK "Change" pattern) returns to the home page's search, empty, with no forced focus.
- Copy is warm, plain, everyday Polish; follow the [GOV.UK style guide](https://www.gov.uk/guidance/style-guide/a-to-z) in spirit. No gesture-only interactions and no icons without labels.
- No third-party requests (fonts, scripts, images).
- **Layout:** every page follows one consistent layout; read [docs/layout.md](docs/layout.md) before any UI change and keep it up to date when a shared component changes.

## Performance

- **Hard gates** (Slow 4G + 4× CPU): LCP ≤ 1.8 s median, TBT ≤ 150 ms, search keystroke ≤ 50 ms; CLS held to ≤ 0.1. They never move to make room for code; if one fails, report to Jakub. Checked by Lighthouse by hand, not in CI: `npm run check:perf` before bigger UI changes (`docs/perf.md`).
- **Size budgets:** first-load JS ≤ 200 KB gzip, street HTML ≤ 30 KB gzip.

## Architecture and data

- **Caching:** every page is a static shell cached with `cacheLife("max")`: until the next deploy, or for pages built from the database until an import purges the `dataset` tag (`POST /api/revalidate`, the only purge; no cron purges anything). Dates are absolute, with their weekday; „Dziś”, „Jutro” are the device's (`web/components/day-word.tsx`), never the server's. The address pages hold nothing date-dependent in their static shell: the page is read per request behind one skeleton, every block's data at once (`Promise.all`, after `io()`). The address routes are `ensureStatic = 'prefetch'`, every known place prerendered.
- **Address page:** IMGW warning cards (`web/components/warning-cards.tsx`), then the timeline (`web/lib/timeline.ts`, `web/components/timeline.tsx`), a link per subpage (`SUBPAGE_IDS`) and one small-print note with the check times and IMGW's source link. Date labels come from `Intl` (`web/lib/dates.ts`). `?imgw=` shows IMGW's mock on a Preview or in development, never in production (`web/lib/imgw-preview.ts`). Spec: `docs/layout.md` (The hub).
- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres (fra1), Drizzle ORM; schema in `web/lib/db/schema.ts`, migrations in `web/drizzle/`. No state library or CMS, and nothing built "for later".
- Data never goes in git: raw sources live in a private S3 bucket (`docs/data/sources.md`; `npm run sources:pull` fills the gitignored `.cache/sources/`). CI fails if a data file is tracked (`check-tracked-data`).
- CI runs on a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`) in a throwaway local Postgres; it refuses any other database, and production never holds it.
- Local development uses only `npm run db:local` (`web/docker-compose.yml`: Postgres on 127.0.0.1 with the same fixture). No real or production data is ever copied locally: no dumps, snapshots or Neon branches.
- **Search:** a compact street and village index cached in the browser (`/api/search-index/<hash>`, immutable, loaded on first focus), `/api/search` as the fallback. The field is accessible-autocomplete's React build, rendered on the server; „Szukaj” or Enter decides on the device (`web/lib/search-submit.ts`). Search lives only on the home page. GOV.UK's error message only for an empty submit. Unknown query parameters redirect to the clean URL. The schedules never ship to the client.
- ICS feeds are cacheable (`s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`).
- The data model is a generic "event at a location" (`docs/database.md`).
- **TERYT (GUS ULIC/SIMC) is the single source of truth for place and street names and types; names from gmina PDFs/schedules are mapped TO TERYT, never the other way.** The import checks TERYT and opens a review issue on any difference (`web/scripts/check-teryt.ts`); a renamed street's old page id redirects only after review (`place_redirects`).
- **Hard rule:** every data item keeps a visible link to its original source and the date it was last checked on its topic page (`source.url`, `source.checkedAt`); the address page shows the check times in one note at the bottom, with IMGW's source link. No source, no display.

## Forbidden

- No manual production deploys. Every merge to `main` deploys to production; `import-review/**` branches never deploy (`web/vercel.json`). Production data also changes without a deploy whenever the unattended import runs (`docs/import.md`): daily by Vercel Cron, or dispatched by hand.
- No production database write (`db:migrate`, `db:import --apply`, `db:redirect --apply`) without asking Jakub in chat and getting his explicit approval for that one run; then backup, dry run, apply, 0-change dry run, through the npm scripts, never `vercel env run` ([docs/database.md](docs/database.md#writing-to-production)).
- No force-push.
- No changes to Vercel domains, DNS or billing. Never enable paid features.
- Never touch resources outside this project.
- Never print or commit secrets (`.env*` stays out of git and out of output).
- Anything paid or destructive needs Jakub's approval.

## Workflow

- Small, focused commits with short messages.
- `biome check`, type check and tests pass before every commit. No local `next build` or `next start`: the CI build on the PR is the build gate.
- Vercel skips the build when every changed file is docs or tests (`web/scripts/vercel-ignore.sh`).
- Opus opens draft PRs only and never merges. Tech Lead merges after Jakub's OK.
