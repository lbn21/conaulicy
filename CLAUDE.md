# conaulicy.pl

A free site for Lubaczów residents. Type your street, see the next waste pickups, add them to your calendar (ICS).
First release is waste pickups only. Guiding principle: modern, clean, minimal, simple.

## Stack

- Next.js 16 (App Router), React 19, TypeScript.
- Styling: `govuk-frontend` (Sass). The last Tailwind CSS v4 utilities are being removed; never add new ones (CI ratchet in `check-own-css`).
- Biome for lint and format. No ESLint, no Prettier.
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app; the importer is `web/scripts/import.ts`), `docs/`, `design/`.

## Design system: GOV.UK Frontend as-is

- **GOV.UK Frontend CSS and JS and alphagov accessible-autocomplete are used unchanged**: markup, class names, sizes, spacing, typography, focus, links, buttons, forms and the page template exactly as the [GOV.UK Design System](https://design-system.service.gov.uk/) and govuk-frontend's templates.
- **Only these are ours**, because GOV.UK forbids other sites to copy them:
  - the brand colours: the Latarnia group takes GOV.UK's brand-blue roles; the rest of GOV.UK's palette is used as-is;
  - the typeface: Atkinson Hyperlegible Next, self-hosted, 400/700; never GDS Transport;
  - the logo: the "ul." plate in the GOV.UK Generic header; our own footer; never the crown, the GOV.UK logotype, or the GOV.UK header or footer.
- **Exception:** GOV.UK hard-codes brand blue in `.govuk-button--inverse`. It may appear in the CSS output, never in markup (`check-own-css` and `check-govuk-assets` enforce this).
- **Light theme only.**
- Any other deviation needs Jakub's approval and a reason in the PR.
- **Own CSS:** only `web/app/site.scss`, for what GOV.UK has no equivalent for (logo plate, bin markers, search suggestions). GOV.UK Sass functions and mixins only, no raw hex or px; capped at 1 KB gzip and 80 lines of code.
- Brand, palette and contrast: [docs/brand.md](docs/brand.md). Audit and migration plan: [docs/govuk-audit.md](docs/govuk-audit.md).

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG 2.2 AA minimum.
- Links never open in a new tab (PDF and source links included).
- One thing per page: no second search box. „Zmień adres” (GOV.UK "Change" pattern) returns to the home page with an empty, focused field.
- Copy is warm, plain, everyday Polish; follow the [GOV.UK style guide](https://www.gov.uk/guidance/style-guide/a-to-z) in spirit. No gesture-only interactions and no icons without labels.
- No third-party requests (fonts, scripts, images).

## Performance

- **Hard gates** (Slow 4G + 4× CPU, `docs/perf.md`): LCP ≤ 1.8 s median, TBT ≤ 150 ms, CLS 0, search keystroke ≤ 50 ms. They never move to make room for code; if one fails, report to Jakub.
- **Size budgets** adapt to GOV.UK Frontend and accessible-autocomplete: first-load JS ≤ 200 KB gzip, street HTML ≤ 30 KB gzip.

## Architecture and data

- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres (Vercel Marketplace, free plan, fra1), Drizzle ORM; schema in `web/lib/db/schema.ts`, migrations in `web/drizzle/`. No state library or CMS, and nothing built "for later" (put it in the backlog).
- The processed dataset is never committed to git.
- Search: a compact street index cached in the browser (`/api/search-index/<hash>`, immutable, loaded on first focus), with `/api/search` as the fallback. Both are rate-limited (Vercel WAF on `/api/*`). The schedules themselves never ship to the client.
- ICS feeds are cacheable (`s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`).
- The data model is a generic "event at a location", so other event types can be added. See `docs/database.md`.
- **Hard rule:** every data item shown on the site or in the PDF keeps a visible link to its original source and the date it was last checked (`source.url`, `source.checkedAt`). No source, no display.

## Forbidden

- No manual production deploys. Every merge to `main` deploys to production automatically.
- No force-push.
- No changes to Vercel domains, DNS or billing. Never enable paid features.
- Never touch `tynki-baryza`, Polymarket, other Vercel teams or other Route 53 zones.
- Never print or commit secrets (`.env*` stays out of git and out of output).
- Anything paid or destructive needs Jakub's approval.

## Workflow

- Small, focused commits with short messages.
- `biome check` and `next build` must pass before every commit.
- Open normal PRs (drafts only when asked). Merge only when explicitly authorised, after green CI and review.
