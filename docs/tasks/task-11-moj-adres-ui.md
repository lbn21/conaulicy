# Task 11 — „Mój adres” UI: design proposals → minimalist mobile-first site (owner: **Opus 5.5 medium**, design idea AND code)

## Changelog
- **18.10.2026, task-00 (binding).** App is `web/` (Next.js App Router, TypeScript), not Astro and not `moj-adres/web/`. Repo `lbn21/conaulicy`. Step 1 output is `design/proposals/`.
- Opus decides **every** UI element and writes the HTML and the whole UI. Grok does not make UI decisions. Every Opus prompt must say: design for **360 px phones first**, then larger screens.
- Styling is **Tailwind CSS** (latest stable). Opus decides how it is used. Format and lint with **Biome** only (no ESLint, no Prettier).
- First release is waste pickups only. Do not build the IMGW warnings banner now. Body text ≥ 18 px, tap targets ≥ 48 px, contrast AA minimum and AAA for body text. Main-page JS ≤ 70 KB gzip.

Repo: `lbn21/conaulicy`, branch `feat/ui` (Step 1, when it runs: `design/step1-proposals`). Directory `web/`.
Data contract: static files from task-10 (`places.json`, `search-index.json`, `sector/{sector}.json`, `ics/{sector}.ics`, `meta.json`), pre-rendered with `generateStaticParams`. Search is client-side over the static index (fuzzy, Polish diacritics stripped). No search API. Until task-10 lands, use `docs/data/sample/*.sample.json` as fixtures (unverified — never ship them as real data).
**Hard rules:** do not deploy to production, no domain work, no contact with anyone. Grok owns data, ETL, routing, caching, infra and tests — do not change ETL outputs; request schema changes in the PR description.

## Product rules (from Jakub)
- **Super simple:** type your street/village → see the next pickups → **one tap adds it to the phone calendar**. No login, no account, no cookie banner, no extra screens. One page + privacy page + sources page.
- **Clean, modern minimalist.** Few elements, lots of whitespace, one accent colour. Fast. Accessible (WCAG 2.2 AA minimum, AAA for body text).
- **Mobile-first is mandatory:** design and build at **360 px width first** (with large text), then scale up (768, 1280). Put this sentence in the Opus prompt.
- **Readable for young and older residents:** body text ≥ 18 px, tap targets ≥ 48 px, plain everyday Polish, no gesture-only actions, no icon without a label, works at 200% zoom and the OS large-text setting, visible focus.
- **Theme switcher: Dark / Light / System. DEFAULT = DARK** (not System). Persist the choice in `localStorage` (`theme` = `dark|light|system`). **No flash of the wrong theme**: inline blocking script in `<head>` sets `data-theme` on `<html>` before first paint, plus `<meta name="color-scheme" content="dark light">`; System follows `prefers-color-scheme` live (listen for changes).
- **Styling:** Tailwind CSS, latest stable. Opus chooses the classes and the layout.
- **Fonts:** self-hosted **woff2**, **latin-ext** subset with full Polish characters (ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ), **OFL licence** (include the licence file), `font-display: swap`, preload the main weight. **Never load from Google Fonts CDN** or any third-party CDN (RODO). No third-party requests at all.
- **Tooling:** Biome (latest stable) for format and lint. Do not add ESLint or Prettier.
- **Tone of all copy:** Polish, warm, friendly, neighbourly — **never corporate or bureaucratic**. Examples: „Wpisz swoją ulicę albo wieś”, „Jutro wystaw zmieszane i popiół 🙂”, „Dodaj do kalendarza – przypomnimy Ci dzień wcześniej”, „Coś się nie zgadza? Daj znać”. Avoid: „Użytkownik”, „niniejszym”, „w celu”, „uprzejmie informujemy”.

## Step 1 — Palette & font proposals (DELIVER FIRST, then STOP for Jakub's choice)
Deliver `design/proposals/index.html` (static, no build step, opens from disk) + PNG screenshots at 360 px and 1280 px, for **2–3 directions**. Each direction:
- Name + one-sentence mood (e.g. „Ciepły wieczór”).
- **Dark and light variants** of the palette (background, surface, text, muted text, primary/accent, border, focus ring, success, warning, danger + one colour per waste group: zmieszane, segregowane, bio, gabaryty), with hex values and a **contrast table** proving AA (text ≥ 4.5:1, large text/UI components ≥ 3:1) in BOTH themes. Body text should also list its ratio and whether it reaches AAA (7:1). Waste groups must not rely on colour alone (icon + label).
- One OFL font family (or a pair), self-hostable woff2 latin-ext, with a Polish pangram sample („Pchnąć w tę łódź jeża lub ośm skrzyń fig”), weights used, total woff2 size (target ≤ 60 KB for the main weight).
- The main screen mocked in both themes is the first release: search, "next pickups" card, add-to-calendar button. No warnings banner (that is the next release). Palette tokens still include success, warning and danger.
**Stop after Step 1.** Jakub picks one direction (and may mix). Do not start Step 2 before an explicit choice is recorded in the PR.

## Step 2 — Build the UI
Screens/components (single page `/`):
1. **Header**: name/logo (text), theme switcher (3-state segmented control, accessible: `role="radiogroup"` or `<fieldset>` with labels; icons + text).
2. **Warnings banner — next release, do not build now.** When `/api/warnings` exists: level, event, valid from–to, link „Szczegóły na meteo.imgw.pl”; IMGW attribution sentences verbatim (see DATA-INVENTORY §5). `stale:true` → subtle note „dane sprzed X godzin”. Dismissible per warning id (localStorage).
3. **Address search**: one input with combobox autocomplete over `places.json` (diacritic-insensitive: „zaluze” finds „Załuże”, „slowackiego” finds „Słowackiego”; city streets shown as „ul. Asnyka, Lubaczów”; villages „Opaka (gm. Lubaczów)”; village parts „Moczar Duży – część wsi Załuże”). WAI-ARIA combobox pattern, keyboard + screen reader tested. Remember the last address in localStorage (optional „Zapomnij mój adres”).
4. **Next pickups card**: the next 3–5 pickups (date in words: „jutro, wtorek 20 października”), grouped fractions with icon + label + colour, a line „Wystaw do 6:00” only where the source states it (gmina). Source + "wersja z dnia" link at the bottom of the card. `sector:null` → friendly „Tej ulicy jeszcze nie mamy – sprawdź w eGmina BOM lub zadzwoń do MZGKiM” (no guessing).
5. **Add to calendar** (primary button, one tap): iOS/macOS → `webcal://<domain>/ics/{sector}.ics`; Android/Google → `https://calendar.google.com/calendar/render?cid=webcal://<domain>/ics/{sector}.ics`; secondary links: „Outlook”, „Pobierz plik .ics”. Short hint: „Google odświeża kalendarz raz na kilka-kilkanaście godzin.”
6. **Full year** (collapsed `<details>`): month list for the sector.
7. **Footer**: „Nie jesteśmy urzędem – w razie wątpliwości obowiązuje harmonogram gminy”, links Sources, Prywatność, „Zgłoś błąd” (mailto placeholder — Tech Lead fills it; do not invent an address).
8. **/prywatnosc**: no cookies, no accounts, cookieless analytics (Vercel Web Analytics — configured in task-12), localStorage only for theme/address/dismissed warnings, server logs by Vercel, contact. Warm tone.
9. **/zrodla**: every source URL with publication + download date, licences, IMGW sentences.

## Non-functional
- Next.js SSG. Search and theme are client-side; street pages are real HTML without the search script. Main-page JS ≤ 70 KB gzip. LCP < 1.5 s on simulated 4G. `search-index.json` loaded on first focus.
- Lighthouse mobile ≥ 95 Performance, 100 Accessibility, 100 Best Practices, ≥ 95 SEO (SEO measured with noindex removed locally).
- Works without JS: static street/village pages, plus a plain list of sectors with links to each sector's ICS and month list.
- `prefers-reduced-motion` respected; tap targets ≥ 48×48 px; body text ≥ 18 px; focus visible in both themes; zoom to 200% without loss. Test at 360 px with large text.
- `lang="pl"`, semantic landmarks, one `<h1>`.

## Acceptance criteria
- [ ] Step 1 delivered: 2–3 directions, each with dark + light palette, AA contrast tables for both, OFL font with Polish pangram, 360 px + 1280 px screenshots; Jakub's choice recorded before Step 2.
- [ ] **360 px check:** screenshots of every screen/state at 360×740 (dark and light) in the PR; no horizontal scroll, no clipped Polish diacritics, the add-to-calendar button visible without scrolling after selecting an address.
- [ ] Default theme on first visit is **Dark** (test with cleared storage and OS set to light). Switching persists across reloads; System follows OS changes live; **no flash of wrong theme** (verify with throttled CPU + hard reload, record a short video/GIF).
- [ ] From the empty page to "added to calendar": ≤ 3 interactions (type, pick, tap).
- [ ] axe-core: 0 serious/critical violations in both themes; keyboard-only and VoiceOver/TalkBack walkthrough notes in the PR.
- [ ] Fonts: woff2 self-hosted, latin-ext, OFL licence file in repo, zero requests to fonts.googleapis.com/gstatic.com or any third-party host (check DevTools network log in the PR).
- [ ] All copy in Polish, warm and neighbourly; a copy deck `web/copy.pl.md` reviewed by Jakub.
- [ ] Tailwind is the only styling layer. `npm run lint` and `npm run format` use Biome. No ESLint config and no Prettier config in the diff.
- [ ] Lighthouse thresholds above met on the preview URL (task-12).
- [ ] PR to `main`, do not merge.
