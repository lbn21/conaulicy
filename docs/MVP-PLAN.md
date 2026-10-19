# „Mój adres” – MVP plan (Lubaczów) · v1 · 18.10.2026

## Changelog
- **18.10.2026, task-00 (binding).** Overrides every Astro / `lbn21/gdzie-zamieszkac` / `moj-adres/` line below.
  - Repo `lbn21/conaulicy` (private), local `~/projects/conaulicy`. Layout: `web/` (Next.js), `etl/` (Python), `docs/`. Seed data stays in `docs/data/`; the pipeline's own cache lives in `etl/data/`.
  - Stack: **Next.js latest stable** (App Router, TypeScript; 16.4.2 on 18.10.2026) on Vercel. Team `gdzie-zamieszkac` (always `--scope gdzie-zamieszkac`), project `conaulicy`, functions region **`fra1`**.
  - Domain **`conaulicy.pl`**. DNS is already in Route 53 zone `Z038133013GA1DDSHXFPJ` (NS propagation in progress). `www` redirects to the apex. Until launch: Basic Auth + `noindex` + `robots.txt` disallow.
  - **First release = waste pickups only** (street → next pickups → ICS). IMGW warnings, water/power outages and email are the next release. The `/api/warnings` design stays in task-12; do not build it now.
  - Pages and sector data are pre-rendered (SSG). Search is a small static JSON index in the browser. ICS is static and CDN-cached. No database, no search API, no warnings cron.
  - Readable for young and older residents: body text ≥ 18 px, contrast AA minimum and **AAA for body text**, tap targets ≥ 48 px, plain Polish, works at 200% zoom. Test at 360 px with large text.
  - UI ideas and UI code: **Opus 5.5 medium** only. Opus decides every UI element and writes the HTML and the whole UI. Grok never makes a UI decision; Grok owns data, ETL, routing, caching, infra and tests. Fewest moving parts. One accent colour.
  - **Tailwind CSS** (latest stable) is the styling layer. Opus decides how it is used. **Biome** (latest stable) formats and lints; no ESLint and no Prettier. Mobile-first: 360 px first, then larger screens (say so in every Opus prompt).
  - Dependencies are the latest **stable** releases only (no canary, beta or rc). The Vercel project Node.js version is pinned to the newest major Vercel supports. Exact versions go in `docs/reports/01-hello-world.md`.

## TL;DR
1. **What:** a free site. Type your street or village in Lubaczów → you see the upcoming waste pickups → one tap adds the schedule to your phone calendar (ICS). No login, no profit goal. IMGW warnings are the next release, not this one.
2. **Data verified:** city = 5 JPGs (sectors by street, 192 street names → TERYT 100% matched), gmina = 5 text PDFs (24/24 villages). IMGW API works (next release). Water: the gmina has an API, MZGKiM has RSS. PGE: blocked by WAF, so no scraping.
3. **Blockers:** (a) the city S2 and S3 tables are pixel-identical in the source, so this needs confirming; (b) 11 city streets are missing from the schedule; (c) the **2027** schedules are not out yet. City: likely mid-Dec 2026. Gmina: ~20.12–10.01.
4. **First release (end of Nov 2026, soft launch):** waste pickups + ICS. **Next release (Jan 2027):** IMGW warnings + water and power outages + email reminders.
5. **Who:** Grok = data, ETL, routing, caching, infra, tests (task-10, task-12). Opus 5.5 medium decides every UI element and writes the UI (task-11). If Opus hands Grok a UI change, the instructions must be exact and Grok follows them literally.
6. **UI:** Tailwind CSS, used however Opus decides. Modern, clean, minimal. Few elements, lots of whitespace, one accent colour. **Mobile-first: design at 360 px first**, then larger screens, including large text. Dark/Light/System with **Dark as default**. Self-hosted OFL fonts. Plain, warm Polish. Body ≥ 18 px, tap targets ≥ 48 px. Biome formats and lints the app (no ESLint, no Prettier).
7. **Accuracy:** no AI-extracted date gets published without human approval. Release gate = 100% match for a full year of 1 city sector + 1 gmina sector.
8. **Cost:** ~0 beyond Vercel Pro. Domain `conaulicy.pl` is chosen; Route 53 zone `Z038133013GA1DDSHXFPJ` already exists (~$0.50/mo). Do not buy anything else or enable a paid add-on without asking. Email is the next release.
9. **Domain:** `conaulicy.pl` (decided). `www` → apex. The Lubaczów-only alternative `mojlubaczow.pl` was not chosen.
10. **Promotion:** no spam. FB groups only with the admin's consent, QR posters from Feb 2027, a note to the gmina only with Jakub's approval. Goal: 300 calendar subscriptions within 3 months of the start of promotion.

---

## 1. Context and decisions
- Basis: the idea ranking that put "Mój adres" first, and `docs/data/DATA-INVENTORY.md` (sources, samples, legality). The older notes lived under `gdzie-zamieszkac/lokalna/`; this repo is the home of the project now.
- Jakub: MVP only. Free public service. Build now from the UK, launch remotely, in-person promotion from Feb 2027. He is building a house himself → "address events" go to the backlog (§12).
- **Guiding principle:** modern, clever, clean, minimal, simple. No over-engineering. Static pages + CDN cache + (later) one tiny API route. No database, no state library, no CMS, no microservices, no abstraction "for later". If it is not needed for this release, leave it out and note it in the backlog. The site should stay easy to extend: one data folder per gmina or source, and nothing built for the next gmina yet.
- Rules for every task: Opus 5.5 medium decides and writes the UI. Grok does not. Give Opus a tight prompt (only the files and specs it needs, including mobile-first at 360 px) and a stop point. UX: "type your street → calendar in one tap". Styling is Tailwind CSS (latest stable). Formatting and linting are Biome (latest stable); do not add ESLint or Prettier. All dependencies are latest stable only. Readable by young and older residents (body ≥ 18 px, AA minimum, AAA for body text, tap targets ≥ 48 px, no gesture-only actions, no unlabelled icons, 200% zoom and OS large text, visible focus). Fonts self-hosted woff2 latin-ext OFL, never a third-party CDN (RODO). Zero third-party requests. Warm, everyday Polish. Hosting: Vercel team `gdzie-zamieszkac` (`--scope gdzie-zamieszkac`), project `conaulicy`, region `fra1`, repo `lbn21/conaulicy`. No secrets in logs. Never touch other Vercel teams, other Route 53 zones, or other projects. Never buy anything; paid or destructive commands need Jakub's approval.

## 2. MVP scope
**First release (soft launch ~end of Nov 2026) — waste pickups only**
- Address search: city streets (TERYT ULIC 1809011), villages and village parts of the gmina (SIMC 1809042). Client-side, over a static index. No search API.
- Upcoming pickups for a sector + the full year. Street and village pages are pre-rendered at build.
- One-tap ICS subscription per sector (webcal / Google / Outlook / .ics file), with a reminder the evening before (VALARM, which Google ignores for subscribed calendars, so we say so in the copy).
- Pages: Sources, Privacy, "Report an error" (mailto, address set by the Tech Lead).
- Data: 2026 for both units + **2027 as soon as it is published** (that is what really matters for users).

**Next release (Jan 2027, before the promotion) — do not build now**
- IMGW meteo warnings for powiat lubaczowski, via one route `/api/warnings` (design in §4 and task-12). Not a cron, not part of this release.
- Planned water outages: gmina (WP API, ZUK Mokrzyca template) + city (MZGKiM RSS) → per village/street, with manual review.
- Power: PGE only as a link/newsletter unless an official feed or permission appears (no WAF scraping).
- Email reminders (double opt-in, Resend or similar). Needs DKIM in the existing Route 53 zone. Check current prices before choosing a provider; no sign-up now.

**Out of scope (MVP)**
Other gminas in the powiat. Push/app. User accounts. News/editorial content. Tradespeople directory. Air quality. Pharmacies. NFZ. RSO (no precise location; maybe v1.2). SMS. Payments. Facebook scraping. Reverse-engineering eGmina BOM/PGE. Any profit model. "Address events" (backlog).

## 3. Data (summary, details in DATA-INVENTORY.md)
| Source | v | Format | Updates | Extraction | Status |
|---|---|---|---|---|---|
| City waste, czystylubaczow.info | v1 | 5× JPG (no text) | once a year, mid-Dec (sometimes half-yearly) | vision-LLM + OCR, 2 passes, human review | 2026 downloaded; S2=S3 flag; 2027 not yet published |
| Gmina waste, gminalubaczow.pl | v1 | 5× text PDF | once a year, ~20.12–10.01 + "częstotliwość" posts | pdftotext parser (deterministic) | 2026 downloaded; column 1 semantics to confirm |
| TERYT ULIC/SIMC (GUS) | v1 | CSV | monthly | filter + matching + aliases | done (206 + 70 streets, 69 places) |
| IMGW warningsmeteo | next release | JSON API | fetched by `/api/warnings`, revalidate 10 min | filter TERYT 1809 | API OK; schema with `teryt` to confirm on a live warning; **not built in the first release** |
| Water, gmina (ZUK) | v1.1 | WP REST API, fixed template | 1–3 days ahead, often | regex + LLM fallback | samples saved |
| Water, city (MZGKiM) | v1.1 | RSS + HTML | a few per month | LLM + review | RSS OK (REST API blocked, we leave it alone) |
| PGE | v1.1 | — | — | link only | WAF blocks; ToS not cleared |
| eGmina BOM | — | app (open zone), web needs Profil Zaufany | — | manual cross-check only | no public feed |
| RSO | v1.2? | JSON | — | — | no powiat field |

## 4. Architecture
```
GitHub Actions (on demand + daily source monitor) ──► ETL (Python, etl/)
   fetch → extract (PDF parser / JPG vision+OCR) → review files ─► [HUMAN APPROVAL] ─► build
   └─ outputs: places.json, search-index.json, sector/{id}.json, ics/{id}.ics, meta.json
        ▼ PR from data/auto → merge to main
Vercel (team gdzie-zamieszkac, project conaulicy, region fra1)
   Next.js 16 App Router (web/): SSG pages via generateStaticParams
   + proxy.ts (Basic Auth + noindex until launch)
        ▼
Resident: client-side search → static page → webcal:// (the calendar fetches the static ICS)
```
- **Static pages.** Street, village and sector data are pre-rendered at build from ETL JSON (`generateStaticParams`). No database. No per-request compute for those pages. Personal data = zero (the ICS is per sector, not per person).
- **Search** runs in the browser over a small static index (fuzzy, Polish diacritics stripped). There is no search API to hammer.
- **ICS** is static (`force-static` route handlers, or files). `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. `Content-Type: text/calendar; charset=utf-8`.
- **IMGW warnings (next release, design only):** one route handler `GET /api/warnings`. It fetches IMGW server-side with `revalidate = 600` and `Cache-Control: s-maxage=600, stale-while-revalidate=3600`, so at most about one upstream call per 10 minutes regardless of traffic. On upstream failure, serve the last good payload with `stale: true`. This replaces the old GitHub Actions warnings cron. Keep the IMGW attribution sentence from `docs/data/DATA-INVENTORY.md`. Do not build the route in the first release.
- **Assets:** hashed static files are `immutable`. CSP `default-src 'self'`. Fonts are self-hosted. No third-party requests.
- **Abuse:** rely on Vercel's built-in DDoS mitigation. When `/api/*` exists, add a WAF rate-limit of **60 requests/minute per IP** on `/api/*` — only if that rule is included in the current plan. If it needs a paid add-on, stop and ask. Document how to turn on **Attack Challenge Mode** in an emergency; do not turn it on now. Read Vercel Spend Management for the team (read-only) and recommend a cap; changing billing is Jakub's call.
- **Budget:** Lighthouse mobile performance ≥ 95, LCP < 1.5 s on simulated 4G, JS for the main page ≤ 150 KB gzip (raised by Jakub 2026-10-19).
- **Manual review:** every AI-extracted date (JPG) and every new PDF version → `review/{sector}-{year}.md` (crop of the source + table + diff) → `approvals.yaml` (who/when). `build.py` will not publish without approval.
- **Accuracy test plan:**
  1. Golden files `gmina-s1-2026` and `miasto-s1-2026`, transcribed cell by cell by a human from the source. Test = **100% agreement** on every date and fraction (release gate).
  2. Remaining sectors: 2 independent extraction passes must agree + human approval.
  3. Weekday sanity: deviations from the sector's usual weekday (44 in 2026, mostly holidays) are each explicitly approved.
  4. Repeat for 2027 before publishing.
  5. After launch: the "Zgłoś błąd" button, plus a monthly manual check of 5 random dates against eGmina BOM (Jakub, on his phone).
- **Source change monitoring:** daily WP API discovery (media/posts) + sha256 of files + hash of the HTML; every 2 h in Dec–Jan. A change opens a GitHub issue and nothing is published automatically. On the site, "data version as of …" next to every card.
- **Year rollover:** if 2027 is not published by 31.12, the site says: „Czekamy na harmonogram 2027 – gmina jeszcze go nie opublikowała. Damy znać w kalendarzu.” No guessing. The ICS stays as is, and new dates get added after approval (same UIDs scheme, so the subscription updates itself).

## 5. UI (task-11, Opus 5.5 medium)
- **Step 1:** 2–3 palette + font proposals in `design/proposals/` (dark and light, AA contrast tables, AAA aimed at for body text, one static preview page per direction, 360 px and 1280 px screenshots in both themes). **Jakub chooses.** Grok does not design colours or fonts. Opus stops after Step 1.
- Step 2 (after Jakub's choice, not now): street search → "Najbliższe odbiory" card → "Dodaj do kalendarza" → year (collapsed) → footer. No warnings banner in this release. Theme switcher Dark/Light/System, **Dark by default**, localStorage, no flash. Mobile-first at 360 px with large text. Body ≥ 18 px, tap targets ≥ 48 px, one accent colour. Lighthouse mobile performance ≥ 95, LCP < 1.5 s on simulated 4G, main-page JS ≤ 150 KB gzip (raised by Jakub 2026-10-19). Street pages work as static HTML without the search script.

## 6. Privacy page (/prywatnosc) – content
- We don't use cookies. No account, no login, no forms in v1.
- The browser keeps (localStorage, on your phone only): your theme and your last address. „Zapomnij mój adres” clears it. Dismissed warnings join this list only in the next release.
- Statistics: **Vercel Web Analytics (cookieless)**, aggregated (pages, add-to-calendar clicks). No Google Analytics, no ads, no third-party fonts or scripts.
- Calendar: your calendar app fetches our ICS file. We see a normal server request (IP/user-agent in the hosting provider's logs, Vercel), and we don't link it to anyone.
- Next-release email: the address only for reminders, double opt-in, unsubscribe link in every email, provider named (Resend or similar), deletion on request. Not in the first release.
- Administrator: Jakub (name/contact to be filled in by Jakub; do not invent). Warm tone, ~1 screen of text.

## 7. Success metrics
- **Main:** **300 calendar subscriptions within 3 months** of the start of promotion (Feb → mid-May 2027). Measured as the "Dodaj do kalendarza" custom event (Vercel WA) + the count of distinct daily ICS fetchers from logs/observability (estimate; to be refined in task-12 within what Pro offers).
- Accuracy: 0 reported incorrect dates that were our fault; a new schedule published ≤ 3 days after the gmina publishes it (with review).
- Usage: ≥ 500 unique visitors/week in pickup weeks after the promotion [S]; ≥ 20% of address searches end in an add-to-calendar click.
- Signal to scale: someone from another gmina asks „a u nas?”.

## 8. Acquisition (no spam)
1. Soft launch (end of Nov): Jakub, family and friends in Lubaczów, 10–20 people → bugs and copy.
2. Local Facebook groups: **only after the admin agrees**. Jakub writes to the admin himself, the admin publishes or approves the post. One post, no repeats.
3. **QR poster from Feb 2027** (in person): building notice boards and shops (with the manager/owner's consent), parish (with the parish office's consent). Poster: „Śmieci w kalendarzu telefonu – zeskanuj i gotowe”.
4. **Informational note to the Urząd Miasta / Urząd Gminy** that a free tool exists (they may link to it). **Sent only with Jakub's approval**, never automatically. Draft to be prepared in Jan 2027.
5. SEO later: pages „Wywóz śmieci [miejscowość] 2027” (after launch, with indexing switched on).
Never: buying ads, mass messaging, tagging people, impersonating the gmina.

## 9. Timeline
| When (2026/27) | What | Who |
|---|---|---|
| 19–20.10 | Jakub approves the plan; task-10/11/12 start | Jakub, Tech Lead |
| 19–26.10 | **UI Step 1:** 2–3 palette/font proposals, then stop | Opus 5.5 medium |
| 19.10–01.11 | Infra: repo, Actions, Vercel preview (Basic Auth + noindex), region fra1 | Grok (task-12) |
| 19.10–08.11 | ETL 2026: parser + vision/OCR + register + ICS; golden tests. No IMGW build | Grok (task-10) |
| ~27.10 | **Jakub chooses the design direction** | Jakub |
| 28.10–15.11 | UI Step 2 on sample data, then real data | Opus 5.5 medium |
| by 15.11 | Jakub: confirm S2 vs S3 in eGmina BOM (his own phone, read-only), choose the domain | Jakub |
| 16–22.11 | Review + accuracy gate (100% on 2 sectors), a11y/Lighthouse | Tech Lead, Jakub |
| ~20.11 | Attach `conaulicy.pl` to the Vercel project once NS for zone `Z038133013GA1DDSHXFPJ` have propagated. `www` → apex. No new zone, no new purchase, without asking | Jakub, Grok |
| **~27–30.11** | **Soft launch** (if the gate passes): remove Basic Auth + noindex, close circle of people | Jakub's go |
| 1–20.12 | Monitoring for 2027 (city, ~mid-Dec) → extraction → review → publish | Grok, Jakub |
| 20.12–10.01 | Gmina 2027 → as above | Grok, Jakub |
| Jan 2027 | Next release: IMGW `/api/warnings` + water + email; draft of the note to the gmina (for approval); posters | Grok, Opus, Jakub |
| **from Feb 2027** | In-person promotion (QR, FB with consent) | Jakub |
| mid-May 2027 | Metrics review (300 subs?) → decide on the next gminas | Jakub |
If the data is not ready (the gate fails or there is no answer on S2/S3), the soft launch moves to the publication of 2027, around mid-Dec. That is fine: real value starts with 2027 anyway.

## 10. Costs
| Item | Cost | Status |
|---|---|---|
| Vercel Pro (team gdzie-zamieszkac) | already paid (~$20/mo) | — |
| GitHub Actions | $0 if we fit the private-repo free minutes. The warnings cron is **dropped**; remaining jobs are a daily source monitor and on-demand ETL. Task-12 still estimates minutes and cites the plan's quota | to check |
| Vercel Web Analytics | within the Pro plan (event quota to confirm) | to check |
| Domain `conaulicy.pl` | chosen; already pointed at Route 53 | done (NS still propagating) |
| **AWS Route 53 hosted zone** `Z038133013GA1DDSHXFPJ` | **~$0.50/mo** + queries (negligible) | zone exists; do not create another |
| Email (next release, Resend or similar) | free tier probably enough at the start; check current limits/prices before choosing | open, next release |
| LLM for JPG extraction | a few calls a year (10 images) | negligible |
Total: **≈ $0 + ~$0.50/mo** beyond Vercel Pro and the domain.

## 11. Domain
**Decided: `conaulicy.pl`.** DNS is in Route 53 zone `Z038133013GA1DDSHXFPJ`. Nameserver propagation was still in progress on 18.10.2026. `www` redirects to the apex. Do not create another zone, do not edit records, and do not attach the domain to Vercel until the infra task, and only with Jakub's go for anything that spends money.

The table below is the 18.10.2026 availability check that led to the choice (RDAP rdap.dns.pl + DNS via dns.google, ~22:55). "Free" meant RDAP 404 and NXDOMAIN. It is a record, not a shopping list.
| Domain | Status | Comment |
|---|---|---|
| **conaulicy.pl** | chosen | „Co na ulicy?” Neutral, beyond waste, scales past Lubaczów. This is the domain |
| twojaulica.pl | free | alternative, warm and personal |
| uprogu.pl / przyprogu.pl | free | short, "on your doorstep" metaphor, less obvious |
| ulicowo.pl | free | short and playful |
| kiedyodbior.pl | free | clear, but **waste only** (doesn't scale to water/house) |
| smieciowo.pl | free | waste only, informal |
| **mojlubaczow.pl** | free | **Lubaczów option** (local trust; doesn't scale) |
| lubaczowdzis.pl | free | sounds like a news site (which we're not doing) |
| podmoimadresem.pl, coumnie.pl, kalendarzmieszkanca.pl, ulica.app | free | backups |
| Taken | — | mojadres.pl, moj-adres.pl, twojadres.pl, naszadres.pl, mojaulica.pl, naszaulica.pl, kiedywywoz.pl, kiedysmieci.pl, wywozy.pl, naulicy.pl, mojaokolica.pl, wlubaczowie.pl |
Do not buy `mojlubaczow.pl` or any other name unless Jakub asks. Runbook (task-12, do not execute during kickoff): wait for NS propagation → Vercel records in this zone only → `www` → apex → `vercel domains add conaulicy.pl --scope gdzie-zamieszkac` → TLS → indexing stays off until launch.

## 12. Open items
1. **S2 = S3 (city):** confirm in eGmina BOM (open zone, Jakub on his phone) or with the 2025 files. Until then, flag it.
2. **11 city streets without a sector** (Gierymskiego, Kossaka, Chełmońskiego, Grottgera, Ustronna, Działkowa, Łąkowa, Podleśna, al. kard. Jaworskiego, os. Mickiewicza, os. Unii Lubelskiej). The site says "no data" and we don't guess.
3. Gmina column 1 "ZMIESZANE I BIO": are both fractions collected on every date?
4. IMGW meteo schema (`teryt` field) to confirm on the first live warning, when `/api/warnings` is built (next release).
5. PGE: terms + official channel. Decide in the next release. The default is a link only.
6. RSO: location filtering (later; not this release).
7. GitHub Actions minutes quota on a private repo (much smaller without a warnings cron); Vercel Web Analytics quota; Resend price list (next release). Vercel Spend Management cap: read the current setting and recommend one; Jakub decides.
8. Privacy page and "Zgłoś błąd": controller's details and contact address (Jakub).
9. Domain `conaulicy.pl` and zone `Z038133013GA1DDSHXFPJ` are decided. Still open: confirm NS propagation, then attach to Vercel (no new purchase). WAF rate-limit on `/api/*` only if it is included in the plan.
10. Note to the gmina/city: draft in Jan 2027, sent only with Jakub's approval.

## 13. Risks
- The 2027 format may change (new tender, new contractor) → the parser has to fail loudly, and we fall back to review.
- A mid-year change in frequency (that has happened) → monitoring of posts, and the "data version" shown on the site.
- An error in our data = loss of trust → review gate + "the gmina announcement prevails" + quick error reporting.
- A small audience: people subscribe and don't come back → we measure subscriptions, not visits.

## 14. Backlog (NOT MVP): "address events" for people building a house
- New local plan resolutions (MPZP) and studium/plan ogólny changes for the gmina (BIP, Dz.Urz. Woj. Podkarpackiego ELI API, see task-01 for the ELI experience).
- Building permits/notifications near the plot (RWDZ GUNB, starostwo lubaczowskie), only aggregated, without personal data.
- Road works and closures (ZDP/GDDKiA, gmina announcements).
- Planned outages for the plot's address (water/power) as part of v1.1+.
- Alerts "within X m of my plot" would need geocoding (PRG addresses), so it's a separate project.
