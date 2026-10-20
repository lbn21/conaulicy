# conaulicy.pl

A free site for Lubaczów residents. Type your street, see the next waste pickups, add them to your calendar (ICS).
First release is waste pickups only. Guiding principle: modern, clean, minimal, simple.

## Stack

- Next.js 16 (App Router), React 19, TypeScript. Styling moves to `govuk-frontend` (Sass); Tailwind CSS v4 stays only until the migration in `docs/govuk-audit.md` removes it.
- Biome for lint and format. No ESLint, no Prettier.
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app; the importer is `web/scripts/import.ts`), `docs/`, `design/`.

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG AA minimum (aim for AAA on body text), with clear focus states.
- **Use GOV.UK Frontend as-is, including its palette; only the brand-blue roles, the typeface and the logo are ours (GOV.UK forbids copying them). No other deviations without Jakub's approval.** So: GOV.UK sizes (19px body, 40px controls), spacing, focus, links and templates exactly.
- Light theme only, as on GOV.UK: no dark mode, no theme toggle, no `prefers-color-scheme: dark` styles.
- Colours: GOV.UK's palette through its Sass functions; the brand-blue group is replaced by the Latarnia amber group (links, brand, surfaces). The palette and contrast table are in `docs/brand.md`. Waste colours follow the real bins (bin markers only).
- Almost no own CSS: GOV.UK classes and components only, plus one small `web/app/site.scss` (logo plate, bin markers, search suggestions) written with GOV.UK Sass functions, no raw hex or px. CI caps it.
- Fonts are self-hosted (Atkinson Hyperlegible Next, 400/700). No third-party requests.
- Copy is in warm, plain, everyday Polish. No gesture-only interactions and no icons without labels.
- Avoid the AI look. Don't use purple gradients, glassmorphism, emoji icons, generic card grids, sparkles or slogans.
- First-load JS is at most 150 KB gzip. Target Lighthouse mobile >= 95 and LCP ≤ 1.8s (median, Slow 4G + 4× CPU), the budget enforced in CI (`docs/perf.md`).

## Design system

GOV.UK is our reference and gold standard; we use GOV.UK Frontend as-is (see the rule above):
- [GOV.UK Design System](https://design-system.service.gov.uk/): components and patterns.
- [GOV.UK Service Manual](https://www.gov.uk/service-manual): service design principles.
- [GOV.UK style guide A–Z](https://www.gov.uk/guidance/style-guide/a-to-z): content; apply it in spirit to Polish copy.

Concrete rules already adopted:
- Links never open in a new tab (including PDF and source links).
- One thing per page: no second search box. Use a „Zmień adres” change link (GOV.UK "Change" pattern) that returns to the home page with an empty, focused field.
- Plain, warm Polish copy.
- Deviations must be approved by Jakub and justified in the PR description.

Brand (logo, colours, type, tone of voice): see [docs/brand.md](docs/brand.md). GOV.UK audit, decisions and migration plan: see [docs/govuk-audit.md](docs/govuk-audit.md).

## Architecture and data

- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres (Vercel Marketplace, free plan, fra1), Drizzle ORM; schema in `web/lib/db/schema.ts`, migrations in `web/drizzle/` (dataset never in git). No state library or CMS, and nothing built "for later" (put it in the backlog).
- The processed dataset is never committed to git.
- Search uses a compact street index cached in the browser (`/api/search-index/<hash>`, immutable, loaded on first focus; since PR #13). The per-query route `/api/search` is the fallback. Both are rate-limited (Vercel WAF on `/api/*`). Never ship the schedules themselves to the client.
- ICS feeds are cacheable (`s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`).
- The data model is a generic "event at a location" so other event types can be added later. Schema: `web/lib/db/schema.ts`; see `docs/database.md`.
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
