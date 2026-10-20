# conaulicy.pl

A free site for Lubaczów residents. Type your street, see the next waste pickups, add them to your calendar (ICS).
First release is waste pickups only. Guiding principle: modern, clean, minimal, simple.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- Biome for lint and format. No ESLint, no Prettier.
- Node 24. Latest stable versions only: no canary, beta or rc.
- Vercel, functions region `fra1`. Always pass `--scope gdzie-zamieszkac`.
- Layout: `web/` (Next.js app), `etl/` (Python ETL), `docs/`, `design/`.

## UI rules

- Mobile-first: design for 360px, then scale up. Must work at 200% text zoom.
- WCAG AA minimum (aim for AAA on body text). Body text 18px, tap targets at least 48px, clear focus states.
- Dark theme is the default, with light and system options. `[data-theme]` overrides `prefers-color-scheme`.
- Tokens: `design/tokens.css` is the source of truth, documented in `design/tokens.md`. Check contrast with `node design/contrast.mjs`.
- One accent, Latarnia amber. Waste colours follow the real bins.
- Fonts are self-hosted (Atkinson Hyperlegible Next, 400/700). No third-party requests.
- Copy is in warm, plain, everyday Polish. No gesture-only interactions and no icons without labels.
- Avoid the AI look. Don't use purple gradients, glassmorphism, emoji icons, generic card grids, sparkles, slogans or the default Inter/shadcn look. Do use editorial type, restraint, local character and crafted details.
- First-load JS is at most 150 KB gzip. Target Lighthouse mobile >= 95 and LCP < 1.5s on 4G.

## Design system

GOV.UK is our reference and gold standard; when in doubt, follow it:
- [GOV.UK Design System](https://design-system.service.gov.uk/): components and patterns.
- [GOV.UK Service Manual](https://www.gov.uk/service-manual): service design principles.
- [GOV.UK style guide A–Z](https://www.gov.uk/guidance/style-guide/a-to-z): content; apply it in spirit to Polish copy.

Concrete rules already adopted:
- Links never open in a new tab (including PDF and source links).
- One thing per page: no second search box. Use a „Zmień adres” change link (GOV.UK "Change" pattern) that returns to the home page with an empty, focused field.
- Plain, warm Polish copy.
- Deviations must be justified in the PR description.

Brand (logo, colours, type, tone of voice): see [docs/brand.md](docs/brand.md).

## Architecture and data

- No over-engineering: static pages, CDN cache and the fewest possible API routes. Storage: Neon Postgres (Vercel Marketplace, free plan, fra1), Drizzle ORM; schema in `web/lib/db/schema.ts`, migrations in `web/drizzle/` (dataset never in git). No state library or CMS, and nothing built "for later" (put it in the backlog).
- The processed dataset is never committed to git.
- Never ship the full street/schedule index to the client. Search goes through a per-query API route, rate-limited (Vercel WAF on `/api/*`).
- ICS feeds are cacheable (`s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`).
- The data model is a generic "event at a location" so other event types can be added later. See `docs/data-model.md`.
- **Hard rule:** every data item shown on the site or in the PDF keeps a visible link to its original source and the date it was last checked (`source.url`, `source.checkedAt`). No source, no display.

## Forbidden

- No production deploys.
- No force-push.
- No changes to Vercel domains, DNS or billing. Never enable paid features.
- Never touch `tynki-baryza`, Polymarket, other Vercel teams or other Route 53 zones.
- Never print or commit secrets (`.env*` stays out of git and out of output).
- Anything paid or destructive needs Jakub's approval.

## Workflow

- Small, focused commits with short messages.
- `biome check` and `next build` must pass before every commit.
- Open draft PRs. Don't merge them yourself.
