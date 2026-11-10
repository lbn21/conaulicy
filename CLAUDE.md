# conaulicy.pl

A free site for Lubaczów residents. Type your street, see what is coming at your address (waste pickups, water cuts, IMGW warnings), add the pickups to your calendar (ICS).
Guiding principle: modern, clean, minimal, simple.

**Which document wins:** [docs/MVP-PLAN.md](docs/MVP-PLAN.md) is the product plan (goals, scope, features and their status, out of scope, backlog) and wins on product questions. This file holds the technical rules for coding agents and wins on technical questions. Keep each in its own file; don't copy one into the other.

## Stack

- Next.js 16 (App Router), React 19, TypeScript.
- Styling: `govuk-frontend` (Sass) only. No Tailwind, PostCSS or other CSS framework (`check-own-css` fails on any package, config, directive or utility class).
- Biome for lint and format. No ESLint, no Prettier.
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app; the one-off importer is `web/scripts/import.ts`, the unattended import `web/scripts/import/`: shared `core/` plus one folder per domain, e.g. `waste/`; see `docs/import.md`), `etl/` (config and review data, no code: `sources.yaml`, its schema, `review/`), `docs/`, `design/`.

## Design system: GOV.UK Frontend as-is

- **GOV.UK Frontend CSS and JS and alphagov accessible-autocomplete are used unchanged**: markup, class names, sizes, spacing, typography, focus, links, buttons, forms and the page template exactly as the [GOV.UK Design System](https://design-system.service.gov.uk/) and govuk-frontend's templates.
- **Only these are ours**, because GOV.UK forbids other sites to copy them:
  - the brand colours: our group, set only in `web/lib/palette.ts` (generated assets are drawn from it at build time, `docs/brand.md`), takes GOV.UK's brand-blue roles; the rest of GOV.UK's palette is used as-is (except visited links, below);
  - the typeface: Atkinson Hyperlegible Next, self-hosted, 400/700; never GDS Transport;
  - the logo: the "ul." plate in the GOV.UK Generic header and, in one colour, in the footer: our own footer markup with `govuk-footer` classes, never the GOV.UK footer component; never the crown, the crest, the GOV.UK logotype, the OGL, a Crown copyright line or the GOV.UK header.
- **Exceptions** (brand blue hard-coded upstream, no setting; `check-own-css` and `check-govuk-assets` enforce them):
  - `.govuk-button--inverse`: may appear in the CSS output, never in markup.
  - accessible-autocomplete's highlighted option (`.autocomplete__option--focused` / `:hover`): stays in its CSS, and `site.scss` overrides the colour with the brand role, so it is never rendered.
  - the plain `.govuk-tag` (default blue): stays in the CSS output; every tag in markup has a colour modifier (`govuk-tag--yellow` / `--orange` / `--red`), so it is never rendered.
- **Deviation (Jakub's decision):** visited links have no colour of their own: `link-visited` is the link colour, set in `web/lib/palette.ts` (`ROLE_STEPS`), as GOV.UK's links without a visited state. No per-link modifier classes for it.
- **Light theme only.**
- **More modern where GOV.UK has nothing (Jakub's decision, 31 Oct 2026):** loading states. Each live block has a skeleton with a subtle pulse and reveals with a short fade (React's `<ViewTransition>`), none of it under `prefers-reduced-motion` (`docs/layout.md`). The address pages and their subpages are one block: one generic skeleton (h1 bar, „Zmień adres”, four section cards, about the first screen), one reveal of the whole page and its breadcrumbs, after the slowest block (`web/components/place-suspense.tsx`; Jakub's decision, task 239); no per-block skeletons there. Empty states are plain text; skeletons are seen as soon as they render, no delay (task 237). Consistent everywhere, GOV.UK markup, type, colours and focus around it, WCAG AA kept.
- Any other deviation needs Jakub's approval and a reason in the PR.
- **Own CSS:** only `web/app/site.scss`, for what GOV.UK has no equivalent for (logo plate, bin markers, search suggestions, the skeletons' bars, cards and pulse, the live blocks' reveal and the address page's timeline). GOV.UK Sass functions and mixins only, no raw hex or px; capped at 1.6 KB gzip and 150 lines of code (80, plus 25 for the motion; Jakub, 31 Oct 2026; plus 2 for a skeleton button's box, task 237, now spent on the skeleton cards, task 239; plus 33 lines and 0.4 KB for the address page's timeline, task 264, and 10 lines and 0.2 KB for its cards and today's beat, task 265). `web/app/tokens.css` holds only the font's metric-matched fallback. Colours have one home each: our brand and IMGW's warning levels (`WARNING_LEVELS`, the warnings' tags; Jakub's decision) in `web/lib/palette.ts`, GOV.UK's own in `web/lib/govuk-colours.ts`, the bin colours in `web/lib/waste-colours.ts` (the CSS custom properties are generated from it); `check-palette` fails on a raw hex anywhere else in the site's code.
- Brand, palette and contrast: [docs/brand.md](docs/brand.md). Audit and migration plan: [docs/govuk-audit.md](docs/govuk-audit.md).

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG 2.2 AA minimum.
- Links never open in a new tab (PDF and source links included).
- **Every internal link is `next/link`, never a plain `<a>`:** every page of the site and every `#fragment`, a same-page anchor included (`FragmentLink`, `web/components/fragment-link.tsx`; tasks 228, 259). Why: in the Next.js 16 App Router a page left by a client-side navigation stays in the document, hidden (`<Activity>`), and only `<Link>` (`router.push`) adds history entries the router knows; a plain `<a href="#…">` makes one it does not, so Back showed another page under the address page's URL ([Link](https://nextjs.org/docs/app/api-reference/components/link), [Linking and navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating)). A plain `<a>` only for an external link: another site, `mailto:`, and a file the browser opens itself (ICS, PDF, `webcal:`, `/fonts/OFL.txt`), which is no page of the app; `web/components/internal-links.test.ts` fails on any other. Prefetch is Next.js's default (Partial Prefetching: one static App Shell per route; the address pages read their place, and every block, behind one `<Suspense>`, `web/components/place-suspense.tsx`); every prefetch is static (`ensureStatic = "prefetch"` on the root layout), except links to an address page: full prefetch on intent, everywhere (`PlaceLink`: `prefetch={active ? addressPrefetch(href) : 'auto'}`), never `prefetch={true}` on first render, never to a redirect source (task 238); see `docs/layout.md` (Navigation) and `docs/perf.md`.
- **Pixel perfect:** paddings, margins and icon/glyph placement are symmetric and equal wherever reasonably possible: on the site, in the PDF, OG images and any new UI. Verified by measuring ink from screenshots (DPR 2-4, about ±0.5 px), with before/after numbers in every UI brief and PR. Where GOV.UK is deliberately asymmetric, flag it instead of silently keeping or changing it (accepted exception: the footer keeps GOV.UK's spacing).
- One thing per page: no second search box. „Zmień adres” (GOV.UK "Change" pattern) returns to the home page's search, empty, with no forced focus (native browser behaviour).
- Copy is warm, plain, everyday Polish; follow the [GOV.UK style guide](https://www.gov.uk/guidance/style-guide/a-to-z) in spirit. No gesture-only interactions and no icons without labels.
- No third-party requests (fonts, scripts, images).
- **Layout:** every page follows one consistent layout; read [docs/layout.md](docs/layout.md) before any UI change and keep it up to date when a shared component changes.

## Performance

- **Hard gates** (Slow 4G + 4× CPU, `docs/perf.md`): LCP ≤ 1.8 s median, TBT ≤ 150 ms, search keystroke ≤ 50 ms. CLS is no longer a hard gate (Jakub's decision, 31 Oct 2026): a live block's reveal may shift the page a little; the checks hold it to web.dev's "good" CLS (≤ 0.1), a late font still moves nothing. They never move to make room for code; if one fails, report to Jakub. Checked by Lighthouse by hand, not in CI: run `npm run check:perf` before bigger UI changes (`docs/perf.md`).
- **Size budgets** adapt to GOV.UK Frontend and accessible-autocomplete: first-load JS ≤ 200 KB gzip, street HTML ≤ 30 KB gzip.

## Architecture and data

- **Caching (Jakub's decision, 31 Oct 2026):** every page is a static shell cached for the longest time (`cacheLife("max")`: until the next deploy, or for pages built from the database until an import's purge of the `dataset` tag, `POST /api/revalidate`, the only purge). Waste dates are absolute, with their weekday („wtorek, 3 listopada”); „Dziś”, „Jutro” are the device's (`use(browser())`, `web/components/day-word.tsx`), never the server's. IMGW's warnings show only on the address page and its `/pogoda` subpage (tasks 257, 263). The address pages hold nothing date-dependent in their static shell (task 239): the whole page is read per request behind one skeleton, every block's data at once (`Promise.all`, after `io()`), the live files through the Blob's CDN (≤ 60 s behind a cron write), each „Sprawdziliśmy” from the same read. No cron purges anything. The address routes are `ensureStatic = 'prefetch'`, every known place prerendered. One function invocation per view of a page with a hole (accepted).
- **Address page (task 263):** date-first. A vertical timeline, „Najbliższe 7 dni” (`web/lib/timeline.ts`, pure, unit-tested; `web/components/timeline.tsx`): a card per Warsaw day, each module's items as GOV.UK summary-list rows with „Szczegóły” to its subpage, 2+ empty days after today as one card, then „Później”; every date label from `Intl` (`DateTimeFormat`, `formatRange`, `RelativeTimeFormat`, `web/lib/dates.ts`). Then a link per subpage and „Skąd to wiemy” (sources, check times). Every module has a subpage: `/smieci`, `/woda`, `/pogoda` (`SUBPAGE_IDS`); `/pogoda` is never indexed. Layout: `docs/layout.md` (The hub).
- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres (Vercel Marketplace, free plan, fra1), Drizzle ORM; schema in `web/lib/db/schema.ts`, migrations in `web/drizzle/`. No state library or CMS, and nothing built "for later" (put it in the backlog, `docs/MVP-PLAN.md` §8).
- Data never goes in git: the processed dataset is not committed, and raw sources live in a private S3 bucket (`docs/data/sources.md`; `npm run sources:pull` fills the gitignored `.cache/sources/`). CI fails if a data file is tracked (`check-tracked-data`).
- CI runs on a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`) in a throwaway local Postgres; it refuses any other database, and production never holds it.
- Local development uses only `npm run db:local` (`web/docker-compose.yml`: Postgres 18 on 127.0.0.1 with the same fixture; `db:local:reset`, `db:local:stop`). No real or production data is ever copied locally: no dumps, snapshots or Neon branches (Jakub's decision, 24 Oct 2026).
- Search: a compact street and village index cached in the browser (`/api/search-index/<hash>`, immutable, loaded on first focus), with `/api/search` as the fallback. The site no longer has to work without JavaScript (Jakub's decision, 31 Oct 2026): the field is accessible-autocomplete's React build, rendered on the server (no field swap at hydration); a picked suggestion only fills the field, as GOV.UK's default, and „Szukaj” or Enter decides on the device over the same index (`web/lib/search-submit.ts`, waiting for it if needed): one place (a pick or one clear match) opens its page by client-side navigation; several are listed under the field, none says what to try (plain text, never an error), both on the home page with no navigation and announced by a polite live region; a skeleton of one result while the index is still loading. Search lives only on the home page: there is no `/szukaj` (removed in task 227, no redirect). GOV.UK's error message and summary only for an empty submit. No rate limit (no Vercel WAF); unknown query parameters are redirected to the clean URL, so the CDN cache holds. The schedules themselves never ship to the client.
- ICS feeds are cacheable (`s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`).
- The data model is a generic "event at a location", so other event types can be added. See `docs/database.md`.
- **TERYT (GUS ULIC/SIMC) is the single source of truth for place and street names and types, for every gmina; names from gmina PDFs/schedules are mapped TO TERYT, never the other way.** The import workflow checks TERYT and opens a review issue on any difference (`web/scripts/check-teryt.ts`); a renamed street's old page id redirects only after review (`place_redirects`, `docs/database.md`).
- **Hard rule:** every data item shown on the site or in the PDF keeps a visible link to its original source and the date it was last checked (`source.url`, `source.checkedAt`). No source, no display.

## Forbidden

- No manual production deploys. Every merge to `main` deploys to production automatically; `import-review/**` branches never deploy (`web/vercel.json`). Production data also changes, without a deploy, whenever the unattended import runs (`docs/import.md`): daily by Vercel Cron (`/api/cron/import`, 04:17 UTC), or dispatched by hand.
- No production database write (`db:migrate`, `db:import --apply`, `db:redirect --apply`) without asking Jakub in chat and getting his explicit approval for that one run; then backup, dry run, apply, 0-change dry run, through the npm scripts, never `vercel env run` ([docs/database.md](docs/database.md#writing-to-production)).
- No force-push.
- No changes to Vercel domains, DNS or billing. Never enable paid features.
- Never touch resources outside this project.
- Never print or commit secrets (`.env*` stays out of git and out of output).
- Anything paid or destructive needs Jakub's approval.

## Workflow

- Small, focused commits with short messages.
- `biome check` and `next build` must pass before every commit.
- Open normal PRs (drafts only when asked). Merge when the task authorises it, after green CI and self-review; wait for the production deploy.
