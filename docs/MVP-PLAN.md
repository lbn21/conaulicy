# conaulicy.pl: product plan (Lubaczów)

**This is the product plan:** goals, scope, features and their status, what is deliberately left out, and the backlog. It wins on product questions. The technical rules for coding agents (stack, design system, performance gates, data rules, what is forbidden) are in [CLAUDE.md](../CLAUDE.md), which wins on technical questions; this file does not repeat them.

Last brought up to date: 7 Nov 2026 (t249), against `main` at `641efcd`. The first version (v1, 18 Oct 2026) is in git history. Items marked **TBD (Jakub)** are open decisions or facts this refresh could not confirm from the repo.

## 1. What and why

- **What:** a free site for the residents of Lubaczów, the town (TERYT 1809011) and the rural gmina (1809042). Type your street or village and see what is coming at your address: the next waste pickups, planned water cuts and IMGW weather warnings. Add the waste schedule to your phone's calendar in one tap (ICS) or print it (PDF).
- **For whom:** young and older residents alike: plain, warm Polish; readable at large text sizes; works on a phone first.
- **Not a business:** no login, no ads, no profit goal, no cookies. Run privately by Jakub, not an official service ("in case of doubt the gmina's announcement prevails").
- **Guiding principle:** modern, clean, minimal, simple. No over-engineering: if a feature is not needed now, it goes to the backlog (§8).
- **Accuracy first:** a wrong date costs trust. Every item keeps a visible link to its source and the date it was last checked on its own topic page (the subpage); the address page shows the check times in one note at the bottom (task 284); no source, no display.

## 2. Features and status

Status: **built** = on `main`, which deploys to production with every merge.

| Feature | Status | Notes |
|---|---|---|
| Address search: town streets, villages and village parts | built | In the browser over a small cached index; optional house number („Asnyka 12”), checked against the address register (PRG) as a hint only |
| Address page (`/adres/<id>`) | built | Date-first (task 263): „Najbliższe 7 dni”, a vertical timeline with a card per day (pickups, water cuts, IMGW warnings; „Szczegóły” to each module's subpage; two or more empty days in a row as one card, saying „Nic nie zaplanowano.” on every place, task 278), then „Później” (the next item per module); above it, only what belongs to no day. Then „Wszystko o Twoim adresie” (a link per subpage) and one small-print note: each module's check time, the AI caveat when it applies, IMGW's required wording (task 284; the sources are on the subpages). „Zmień adres” goes back to the home page's search |
| Waste pickups (`/adres/<id>/smieci`) | built | Upcoming pickups and the full year for the address's zone; on a split street, the zone is chosen by house number |
| Waste calendar (ICS) | built | One subscription per zone (webcal, Google, Outlook, `.ics` file), updated in place when dates change |
| Printable schedule (PDF) | built | A4, with a QR code and a printed link back to the waste page |
| Water cuts (`/adres/<id>/woda`) | built | Gmina: ZUK Mokrzyca's posts on gminalubaczow.pl. Town: MZGKiM's announcements. Checked every 15 minutes; an item that fails the checks is not shown, and residents get a link to the post instead. A per-address calendar of cuts (`woda.ics`) |
| IMGW weather warnings (`/adres/<id>/pogoda`) | built | On the address page and its `/pogoda` subpage only (tasks 257, 263): each warning on its days in the timeline, IMGW's own description on `/pogoda` (a card per warning, never indexed), for the powiat lubaczowski; the last good copy is kept when IMGW does not answer |
| All places (`/ulice`) | built | A plain list of every street and village, every one alike (no „(brak danych)”: a place without a waste schedule still has water and IMGW, task 276) |
| Static pages | built | `/o-projekcie`, `/prywatnosc`, `/dostepnosc` (accessibility statement and credits) |
| Reporting an error | built | By email only: kontakt@conaulicy.pl. No form, no GitHub Issues |
| Statistics | built | Vercel Web Analytics, cookieless, production only; events `calendar_add`, `pdf_open`, `water_calendar_add` |
| Waste schedule updates | built | A daily unattended import finds new schedule files; Grok reads each one, and **a person reviews every new schedule** in a pull request before anything goes live (`docs/import.md`) |
| Street and village names | built | From TERYT (GUS); a change in TERYT opens a review, nothing is applied automatically |
| Indexing and sitemap | built | One switch (`docs/launch.md`): while `SITE_BASIC_AUTH` is set in production, the site is gated and `noindex` |
| Public launch | **TBD (Jakub)** | Whether the production gate is already off and the site indexed, and the soft-launch date (v1 planned the end of Nov 2026) |

Change from v1: v1 put water cuts and IMGW warnings in a second release (Jan 2027). Both are now built and on the home page and the address pages (tasks 97–98, 111–117, 137, 151).

## 3. How it works (product view)

The details and the rules are in CLAUDE.md and `docs/`; this is only the shape.

- **Pages:** Next.js on Vercel (region fra1). Address pages are read per request behind one loading skeleton; everything else is cached on the CDN. Search runs in the browser; the schedules never ship to the client.
- **Look:** the GOV.UK Design System as-is, with only our logo (the „ul.” plate), brand colours and typeface (Atkinson Hyperlegible Next). Light theme only. No Tailwind. (`docs/brand.md`, `docs/layout.md`.)
- **Data stores:** waste schedules, places and zones in Neon Postgres; the live water and IMGW files in Vercel Blob. Raw source files are archived in a private S3 bucket, never in git.
- **Schedules:** Vercel Cron starts the daily import at 04:17 UTC (GitHub Actions). New files are read by **Grok** (xAI, `grok-4.7`) and reviewed by a person. There is no Python ETL; `etl/` holds only config (`sources.yaml`) and review data.
- **Water and IMGW:** one Vercel Cron, every 15 minutes, reads the new or edited water posts with Grok and fetches IMGW's public API, then writes the files to Blob. No database writes.
- **Accuracy checks:** waste: date rules (the schedule year, the usual weekday or an approved holiday shift, a sane count per fraction) and the human review PR. Water: a gate of certain checks per item; anything doubtful is left out and the post is linked.

## 4. Data sources

Details, samples and legal basis: `docs/data/DATA-INVENTORY.md`, `docs/data/sources.md`, `docs/data/imgw.md`, `docs/zuk.md`.

| Source | Used for | Format | How often it changes | Status |
|---|---|---|---|---|
| czystylubaczow.info (town waste) | waste, town | 5 JPGs, one per sector | once a year, about mid-December | 2026 imported and reviewed; 2027 not yet published |
| gminalubaczow.pl (gmina waste) | waste, gmina | 5 text PDFs | once a year, about 20 Dec–10 Jan, plus frequency posts | 2026 imported and reviewed; 2027 not yet published |
| gminalubaczow.pl posts (ZUK Mokrzyca) | water, gmina | WordPress API | cuts announced 0–4 days ahead | built |
| MZGKiM announcements | water, town | web posts | a few a month | built |
| IMGW-PIB `warningsmeteo` | weather warnings | public JSON API | hours | built |
| TERYT ULIC/SIMC (GUS) | every place and street name | CSV | monthly | built; checked on every import |
| PRG (address register) | house-number hint | — | — | built |
| PGE Dystrybucja | power cuts | — (site behind a WAF) | — | not built; no scraping |
| eGmina BOM app | manual cross-check only | app | — | never a data source |
| RCB / RSO | alerts | JSON | — | not built; no powiat field |

## 5. Deliberately out of scope

Other gminas in the powiat (until the metrics say so, §6). Push notifications or an app. User accounts. News or editorial content. A tradespeople directory. Air quality, pharmacies, NFZ. SMS. Payments. Scraping Facebook or anything behind a WAF (PGE). Reverse-engineering eGmina BOM. Any profit model. A dark theme. Working without JavaScript (Jakub's decision, 31 Oct 2026). A second search box on any page.

## 6. Launch, promotion and success

**Timeline** (v1's dates):

| When | What | Status |
|---|---|---|
| ~27–30 Nov 2026 | Soft launch: gate off, family and friends in Lubaczów (10–20 people) for bugs and copy | **TBD (Jakub)** |
| 1–20 Dec 2026 | Town 2027 schedules: the import picks them up, a person reviews, then they go live | waiting for the source |
| 20 Dec 2026–10 Jan 2027 | Gmina 2027 schedules: the same | waiting for the source |
| Jan 2027 | Draft of the note to the town and gmina offices (sent only with Jakub's approval); posters | planned |
| from Feb 2027 | In-person promotion | planned |
| mid-May 2027 | Metrics review, then decide on other gminas | planned |

If the 2027 schedule is not out by 31 Dec, the site says so plainly and guesses nothing; the calendar subscription updates itself once the new dates are reviewed.

**Promotion, no spam:**
1. Soft launch with people Jakub knows.
2. Local Facebook groups only after the admin agrees; one post, no repeats.
3. QR posters from Feb 2027 („Śmieci w kalendarzu telefonu – zeskanuj i gotowe”), only with the owner's or manager's consent.
4. A short note to the Urząd Miasta and the Urząd Gminy that the tool exists, only with Jakub's approval, never automatically.
5. SEO after launch („Wywóz śmieci [miejscowość] 2027”), with indexing on.

Never: paid ads, mass messages, tagging people, looking like the gmina.

**Success metrics:**
- **Main:** 300 calendar subscriptions within 3 months of the start of promotion (Feb to mid-May 2027), measured by `calendar_add` and an estimate of distinct ICS fetchers. **TBD (Jakub):** how the ICS fetchers are counted.
- Accuracy: no wrong date that was our fault; a new schedule live within 3 days of the gmina publishing it.
- Usage: at least 500 unique visitors a week in pickup weeks after the promotion; at least 20 % of address searches end in an add-to-calendar.
- Signal to grow: someone from another gmina asks „a u nas?”.

**Costs:** Vercel Pro (already paid), the Neon free plan, Vercel Blob and Web Analytics within the plan, GitHub Actions, the Route 53 zone (about $0.50 a month), and xAI calls for Grok (waste: a few files a year; water: only new or edited posts). Nothing paid is added without Jakub's approval. **TBD (Jakub):** the monthly xAI spend, and whether a Vercel spend cap is set.

## 7. Open questions

1. **Town S2 = S3:** the two sectors' 2026 tables are pixel-identical in the source. Both were reviewed and imported; **TBD (Jakub):** whether this was ever confirmed (eGmina BOM or the 2025 files).
2. **Town streets with no sector** (11 in v1: Gierymskiego, Kossaka, Chełmońskiego, Grottgera, Ustronna, Działkowa, Łąkowa, Podleśna, al. kard. Jaworskiego, os. Mickiewicza, os. Unii Lubelskiej): the site says it has no waste schedule for them yet and guesses nothing; water and IMGW work as anywhere (task 276). **TBD (Jakub):** whether this is still so.
3. **Gmina column 1 „zmieszane i bio”:** are both collected on every date? The site says what the PDF says. **TBD (Jakub).**
4. **v1's release gate** (a 100 % match for a full year of one town and one gmina sector, against hand-transcribed golden files): **TBD (Jakub)** whether it still applies, or the per-file human review PR replaced it.
5. **PGE power cuts:** a link only, unless an official feed or permission appears. **TBD (Jakub).**
6. **Email reminders** (v1's next release: double opt-in, a provider such as Resend, DKIM in the Route 53 zone): **TBD (Jakub)** whether they are still planned.

## 8. Backlog (not now)

- Email reminders (§7.6).
- Power cuts from PGE (§7.5).
- RSO alerts, if location filtering becomes possible.
- Other gminas in the powiat, after the May 2027 review.
- "Address events" for people building a house: new local plans (MPZP) and plan ogólny changes, building permits near a plot (aggregated, no personal data), road works and closures. Alerts "within X m of my plot" would need geocoding and are a separate project.
