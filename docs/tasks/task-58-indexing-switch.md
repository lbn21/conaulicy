# Task 58: one switch for search-engine indexing (+ vercel.app → conaulicy.pl)

Approved by Jakub, 22 Oct 2026 (production-release PR 1 of 4). Branch: `feat/indexing-switch` from the current `origin/main`.

## Why

We are preparing the public launch so Google can index conaulicy.pl. Today `noindex` is hardcoded in three places, so removing the Basic Auth gate alone would still keep Google out:

- `web/next.config.ts` `headers()`: `X-Robots-Tag: noindex, nofollow` on `/:path*`
- `web/app/layout.tsx`: `metadata.robots = { index: false, follow: false }`
- `web/app/robots.ts`: `Disallow: /`

The gate itself (`web/proxy.ts`, active when `SITE_BASIC_AUTH` is set; `web/lib/gate.ts` forces `private, no-store`) stays exactly as it is. **This PR must not change anything visible today**: production is still gated, so after merge https://conaulicy.pl must still answer 401 + noindex. The gate is removed later, separately, by Jakub (env change + redeploy) — not in this task.

## Changes

### `web/lib/indexing.ts` (new) + `web/lib/indexing.test.ts`
- `export function indexable(env = process.env): boolean` → `env.VERCEL_ENV === "production" && !env.SITE_BASIC_AUTH`.
- Short comment: the only place that decides whether search engines may index the site; production deploy without the gate. Preview, local and CI builds are never indexable.
- Unit test (node:test, like the other `lib/*.test.ts`): all combinations — production+no gate → true; production+gate → false; preview (with/without gate) → false; unset VERCEL_ENV → false; empty-string `SITE_BASIC_AUTH` counts as no gate (matches `proxy.ts`, which uses truthiness).

### `web/next.config.ts`
- `headers()`: return the `X-Robots-Tag: noindex, nofollow` rule only when `!indexable()`; otherwise no such rule (keep the function, return `[]` or the other rules).
- `redirects()` (new): host redirect `conaulicy.vercel.app` → `https://conaulicy.pl` keeping path and query: `{ source: "/:path*", has: [{ type: "host", value: "conaulicy.vercel.app" }], destination: "https://conaulicy.pl/:path*", permanent: true }` (308; Next keeps the query string). Always on (also while gated — the gate on conaulicy.pl then asks for the password, same as today). Do not redirect any other host (preview URLs like `conaulicy-git-*.vercel.app` must keep working). 308 keeps the method, so a `POST /api/revalidate` sent to the vercel.app host still arrives.
- Comment in the file: `headers()`/`redirects()` are evaluated at **build** time (baked into the routes manifest). On Vercel `VERCEL_ENV` and `SITE_BASIC_AUTH` are available at build, so this is correct, but **changing `SITE_BASIC_AUTH` needs a redeploy** to flip indexing. (Removing the gate needs a redeploy anyway.)

### `web/app/layout.tsx`
- `robots: indexable() ? { index: true, follow: true } : { index: false, follow: false }`. Everything else unchanged.

### `web/app/robots.ts`
- Indexable: `rules: { userAgent: "*", allow: "/", disallow: "/api/" }`, `sitemap: "https://conaulicy.pl/sitemap.xml"` (build it from `SITE_URL` in `web/lib/config.generated.ts`, not a new literal). `/sitemap.xml` itself is added in the next task; pointing at it now is fine because nothing is indexable until launch.
- Not indexable: `rules: { userAgent: "*", disallow: "/" }` (as today).
- Note: while gated, `proxy.ts` answers `/robots.txt` itself with `Disallow: /`; leave that untouched.

### CI: `web/scripts/check-indexing.mjs` (new) + steps in `.github/workflows/ci.yml` (`web` job)
Follow the style of the existing check scripts (how they start the built app, ports, cleanup — e.g. `check-html.mjs`, `check-examples.mjs`).
1. **Normal CI build (not indexable)** — run right after the existing checks that use the normal build, against the normal build: every one of `/`, one street `/adres/<id>` and one village from the CI fixture, `/dostepnosc` returns `X-Robots-Tag: noindex, nofollow` and `<meta name="robots" content="noindex, nofollow">`; `/robots.txt` contains `Disallow: /` and no `Sitemap:`.
2. **Production-like build (indexable)** — a second build with `VERCEL_ENV=production` and no `SITE_BASIC_AUTH`, then the same script in an "indexable" mode: no `X-Robots-Tag` header on those pages, meta robots is `index, follow` (or absent — decide and assert precisely what Next emits), `/robots.txt` has `Allow: /`, `Disallow: /api/` and `Sitemap: https://conaulicy.pl/sitemap.xml`; a request with `Host: conaulicy.vercel.app` to `/adres/x?nr=1` gets 308 with `Location: https://conaulicy.pl/adres/x?nr=1`.
   - Place this second build **before** the importer steps (`check-import.mjs` empties the database) and make sure no later step relies on the first build being in `.next` (if one does, put the prod-like build last, or build it into a separate dir — your call, explain in the PR). Keep added CI time small (a build is ~20–60 s).
   - Do not set any other Vercel env var. `WebAnalytics` renders when `VERCEL_ENV=production`; that is fine for a local check (just a script tag).
- The script takes the mode as an argument (e.g. `--expect=noindex|index`) so PR 2 can extend it for the sitemap.

### Docs
- Short section in `docs/launch.md` (create it if missing; check first for an existing launch/checklist doc and use that instead): "Indexing: one switch (`web/lib/indexing.ts`). Indexable only on a production deployment without `SITE_BASIC_AUTH`. To launch: remove `SITE_BASIC_AUTH` from Production in Vercel, then redeploy (headers, robots and redirects are fixed at build time). Preview stays gated." Also mention the vercel.app → conaulicy.pl 308.
- Update `CLAUDE.md`/`web/AGENTS.md` only if they state that noindex is hardcoded.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not remove the gate; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only (no custom scroll/focus/keyboard JS); links never open in a new tab; GOV.UK Design System patterns, mobile-first, WCAG AA, light theme only; Polish copy warm and neighbourly, never corporate/official; no new client JS.
- Scope only: no unrelated changes.

## Done
One commit on `feat/indexing-switch` (this brief included), PR titled "One switch for indexing; vercel.app redirects to conaulicy.pl", wait for CI green (`gh pr checks --watch`). Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration and where you placed the prod-like build. The reviewer squash-merges after checking the diff.
