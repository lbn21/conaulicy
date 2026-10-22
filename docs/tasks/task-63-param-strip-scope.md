# Task 63: strip unknown query parameters only on the cacheable page routes (fix #84 regression)

Approved by Jakub, 22 Oct 2026. Branch: `fix/param-strip-scope` from the current `origin/main` (0b0071b or later).

## Bug (live on https://conaulicy.pl)

PR #84 (task 62) added `web/lib/clean-query.ts` + a 308 in `web/proxy.ts`: every path not in its small allowlist is treated as "takes no parameters", so ANY query is redirected away. Next.js metadata files are linked with a cache-busting query, so they now 308:
- `/favicon.ico?favicon.2zyqv1b-1_vd2.ico` → `/favicon.ico`
- `/icon.svg?icon.0otmg08cw9-wb.svg` → `/icon.svg`
- `/apple-icon.png?apple-icon.290v98y1wixts.png` → `/apple-icon.png`
The same applies to `/manifest.webmanifest`, `/og.png`, `/robots.txt`, `/sitemap.xml` and any other file/metadata route.

## Fix: invert the scope — an allowlist of route patterns

In `web/lib/clean-query.ts`, `cleanQuery(pathname, searchParams)` acts **only** on these explicit cacheable routes; every other path returns `null` (untouched, whatever the query):

| Route pattern | Allowed params |
|---|---|
| `/` | none |
| `/ulice`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie` | none |
| `/adres/<id>` | `nr` |
| `/adres/<id>/nr/<...>` | none |
| `/adres/<id>/numer` | none |
| `/adres/<id>/harmonogram.pdf` | `nr` |
| `/ics/<zone>` | none |
| `/api/search` | `q` |
| `/api/search-index/<version>` | none |

- One table of `[RegExp, allowed[]]` anchored patterns (`^…$`); `<id>`, `<zone>`, `<version>` = one path segment without `/` (`[^/]+`); `nr/<...>` = one or more segments. Remove the separate `UNTOUCHED` exclude list (no longer needed: unmatched = untouched). Keep everything else about the behaviour: first value of each allowed param, allowlist order, empty `nr=` kept, `URLSearchParams` re-encoding, GET/HEAD only, 308, before the gate.
- Nothing with another file extension is matched (favicon.ico, *.svg, *.png, *.webmanifest, robots.txt, sitemap.xml, og.png, …), nor Next metadata routes, `/_next/*`, `/_vercel/*`, `/.well-known/*`, `/api/revalidate`, unknown paths (404s).
- Static page list: derive the static page paths from what actually exists in `web/app/` (check; today `/`, `/ulice`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`). Leave the proxy `config.matcher` as is unless a change is required.
- Update the header comment in `clean-query.ts` and the line in `docs/launch.md` if it describes the old scope.

## Tests
- `web/lib/clean-query.test.ts`: keep the existing route cases that still apply; replace "every other route takes no parameters" with: `/favicon.ico?favicon.2zyqv1b-1_vd2.ico`, `/icon.svg?icon.0otmg08cw9-wb.svg`, `/apple-icon.png?apple-icon.290v98y1wixts.png`, `/manifest.webmanifest?x=1`, `/og.png?x=1`, `/robots.txt?x=1`, `/sitemap.xml?x=1`, `/nie-ma-takiej-strony?x=1`, `/adres/X/cos-innego?x=1` → `null`; and `/?x=1`, `/ulice?utm_source=fb`, `/dostepnosc?x=1`, `/adres/X/numer?nr=1`, `/adres/X/nr/12?x=1`, `/ics/Z?x=1`, `/api/search-index/abc?x=1` → `""`.
- CI `web/scripts/check-query.mjs`: add — the three icon URLs **read from the home page HTML** (`<link rel="icon"…>`, `<link rel="apple-touch-icon"…>` hrefs with their `?…` queries) return 200, not 308; `/manifest.webmanifest?x=1` and `/robots.txt?x=1` return 200; and `?x=1` still gives a 308 to the clean URL on a street page, its PDF (`/adres/0972447-00470/harmonogram.pdf?x=1`) and an ICS link taken from the street page (`/ics/<zone>?x=1`). Keep the existing cases.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only; no new client JS. Minimal code. Scope only: no unrelated changes.

## Done
One commit on `fix/param-strip-scope` (this brief included; fix-ups fine), PR titled "Strip unknown query parameters only on the cacheable page routes", wait for CI green (`gh pr checks --watch`). Do not merge (ignore any suggestion to merge). Report the PR link, `git diff --stat origin/main`, CI duration. The reviewer squash-merges.
