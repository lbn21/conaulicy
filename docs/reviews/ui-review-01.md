# UI review 01

Date: 2026-10-19. Branch `ui/skeleton` at `a40d72e`. Reviewer: Claude Opus 5.5.
Scope: `web/app/**`, `web/components/**`, UI parts of `web/lib/**`. Judged against `CLAUDE.md`.
Method: code reading plus one production build (`next build`). No browser, screen reader or zoom testing, so treat reflow and announcement items as code-level findings to confirm on a 360px device.

## Bundle: correction first

The "~178 KB" figure was a measuring mistake. That sum included `chunks/0cz1d0mv5g_q7.js`, the core-js polyfill (39.4 KB gzip). Next loads it with `noModule`, so modern browsers never download it.
Using Next's own list (`.next/diagnostics/route-bundle-stats.json`) and gzip -9:

| Route | First-load JS (gzip) |
| --- | ---: |
| `/` | 138.7 KB |
| `/adres/0972447-00470` | 139.8 KB |
| `/prywatnosc`, `/_not-found` | 136.9 KB |

**Within the 150 KB budget, with about 10 KB of headroom.** Main causes, all framework:

- React DOM, 71.8 KB (`2khxl0v1q4i6n.js`).
- Next app router and runtime, 49.5 KB (`0r-yur70-ku2o.js`).
- Shared client chunks, about 9.7 KB.
- Turbopack runtime, 3.9 KB.

The app's own code adds only 2–3 KB per page. No cheap cut exists below about 137 KB short of leaving the App Router, so the budget items below are P2 guardrails, not P1.

## P1: bugs, accessibility, WCAG AA

1. `web/components/pickup-schedule.tsx:158` – The static HTML (pre-hydration and no-JS) lists every day from build time, past ones included, inside an open `<details>`. After hydration the hero appears and the list collapses. That is a large layout shift, the LCP element arrives late, and dates already gone are shown as upcoming. **Fix:** filter by build date on the server (`getPlace` with `todayInWarsaw()`, rebuilt daily) and always render the hero. Only the "dziś/jutro" word should wait for the client.
2. `web/components/pickup-schedule.tsx:98` – Heading levels are wrong. The first day is an `h2` and later days are `h3`, so screen readers present days 2–n as subsections of day 1 (WCAG 1.3.1). **Fix:** add an `h2` "Najbliższe odbiory" above the list (it can be visually hidden) and make every day an `h3`.
3. `web/components/address-search.tsx:113` – Pressing Enter during the 250 ms debounce submits with the *previous* query's results. With one stale hit it navigates to the wrong address. **Fix:** clear `hits` and set `status` to "loading" in `onChange`, and ignore submit while loading.
4. `web/components/address-search.tsx:121` – The error message uses `text-muted` with no other cue, so it reads like the hint (WCAG 1.4.1 risk, and it is easy to miss). **Fix:** use `text-danger` and start the message with a word like "Błąd:".
5. `web/app/adres/[id]/page.tsx:43` – The empty state says "sprawdź odbiory w harmonogramie gminy" but gives no link, so it is a dead end. **Fix:** link the official gmina schedule page or PDF.

## P2: UX and visual quality against CLAUDE.md

6. `web/app/page.tsx:21` – The home page renders every place as a link. That is fine for the sample, but with the real dataset it ships the full index to the client, which the data policy forbids. **Fix:** remove the section before real data lands, or cap it at a handful of examples.
7. `web/app/page.tsx:23` – "Adresy w tej próbce" and "Resztę dopisujemy" are developer words on a resident-facing page. **Fix:** use "Przykładowe adresy" or remove the section at launch.
8. `web/components/address-search.tsx:125` – "Na razie znamy tylko kilka adresów – są niżej." breaks once the sample list goes. **Fix:** move it to a constant tied to item 6 and replace it with a "zgłoś brak" path later.
9. `web/components/pickup-schedule.tsx:46` – `subscribe` never fires, so "dziś" and "jutro" go stale on a tab left open overnight (common on phones). **Fix:** subscribe to `visibilitychange` plus a timeout to the next Warsaw midnight.
10. `web/components/theme-switch.tsx:78` – The icon-only toggle (requested) conflicts with the CLAUDE.md rule "no icons without labels" for older users. **Fix:** keep it icon-only at 360px and show the text label from `sm:` up, or give it a visible label on the privacy page.
11. `web/app/adres/[id]/page.tsx:68` – "Źródło: harmonogram_….pdf" shows a raw filename as plain text. **Fix:** make it a link with a human label ("Harmonogram gminy, PDF").
12. `web/app/prywatnosc/page.tsx:43` – "Te logi prowadzi hosting, nie my" is legally shaky: the site operator is the controller and the host is a processor. The page also has no contact or controller identity. **Fix:** name the operator, add a contact, and say "hosting zapisuje je w naszym imieniu".
13. `web/components/pickup-schedule.tsx:122` – The hero says "paź, wtorek". An abbreviated month is harder for older readers, and there is room for the full word. **Fix:** use `month: "long"` ("20 października, wtorek").
14. `web/components/pickup-schedule.tsx:191` – The summary says "Pokaż więcej terminów" even when open, and the default disclosure marker is unstyled. **Fix:** toggle the text to "Zwiń terminy" (a CSS `[open]` swap is enough) and use a clear chevron.
15. `web/app/layout.tsx:27` – Only the 400 weight is preloaded. The h1 (the LCP text) is 700, so it swaps after load. **Fix:** also preload `latin-ext-700`, or drop the latin 400 preload if the budget matters.
16. `web/app/page.tsx:8` – The home page is a generic headline + search + list. It isn't "AI-look", but it has no local character yet. **Fix:** add one concrete local line, e.g. the next city-wide pickup ("Najbliżej: szkło, czwartek 22 października").
17. Budget guardrail – With about 10 KB of headroom, any client library (date-fns, a fuzzy search lib) breaks the budget. **Fix:** add a CI step that reads `route-bundle-stats.json`, excludes `noModule`, and fails above 150 KB.
18. `web/app/api/search/route.ts:6` – No `Cache-Control`, so identical queries always hit the function. The rate limit exists only in the WAF and isn't visible here. **Fix:** add `public, s-maxage=86400` and document the WAF rule next to the route.

## P3: nits

19. `web/components/theme-switch.tsx:68` – The `useLayoutEffect` re-applies the theme that the inline head script already set. This is dead code. **Fix:** delete it.
20. `web/components/theme-switch.tsx:74` – The server snapshot is "dark", so a light-mode user sees the moon icon until hydration. **Fix:** accept it, or render the icon via CSS keyed on `[data-theme]`.
21. `web/components/pickup-schedule.tsx:192` – `list-none` is dead because Tailwind preflight already strips list styles. **Fix:** remove the conditional class.
22. `web/components/pickup-schedule.tsx:19` – `Pickup` and `PickupDay` duplicate `web/lib/schedule.ts:18`. **Fix:** `import type` them from `@/lib/schedule`.
23. `web/components/pickup-schedule.tsx:66` – An unknown subtype falls back to the black zmieszane bin, which is misleading. **Fix:** use a neutral `secondary` chip with a generic icon.
24. `web/components/pickup-schedule.tsx:42` – The `Car` icon for opony is weak, because lucide has no tyre icon. **Fix:** use `CircleDot`, or keep `Car` and rely on the label.
25. `web/components/pickup-schedule.tsx:97` – `putOutBy` takes the first pickup's time, so a day with different times per fraction shows only one. **Fix:** show the earliest time, or the time per pickup.
26. `web/components/pickup-schedule.tsx:118` – `text-[4.5rem]` is off the type scale. **Fix:** add a `--text-display` token.
27. `web/components/address-search.tsx:141` – The search icon is still hand-drawn SVG, inconsistent now that lucide is in. **Fix:** use lucide `Search`.
28. `web/components/address-search.tsx:179` – The placeholder "np. Słowackiego" and the hint "np. Lisie Jamy" give two different examples. **Fix:** keep one example, in the hint only.
29. `web/components/address-search.tsx:120` – "Szukam…" is announced on every keystroke pause, which is noisy for screen readers. **Fix:** only show "Szukam…" if the request takes longer than about 500 ms.
30. `web/components/address-search.tsx:204` – `tabIndex={-1}` on options is unneeded with `aria-activedescendant`. **Fix:** remove it.
31. `web/components/site-footer.tsx:6` – "Nie jesteśmy urzędem – obowiązuje harmonogram gminy" has no full stop, unlike every other sentence. **Fix:** add the period.
32. `web/app/adres/[id]/page.tsx:69` – `break-all` splits words mid-letter. **Fix:** use `break-words` (`overflow-wrap: anywhere`).
33. `web/app/globals.css:56` – Fade-in is gated on `no-preference` *and* the global `reduce` override also kills it, so one is redundant. **Fix:** keep the `no-preference` gate and drop the animation lines from the global block.
34. `web/app/layout.tsx:20` – There is no `themeColor`, so the mobile browser chrome stays white in dark mode. **Fix:** add `themeColor` for both media queries (`#10141d` / `#f5f7fa`).
35. `web/app/tokens.css:3` – This file is a hand copy of `design/tokens.css`, so the two can drift. **Fix:** have `design/contrast.mjs` (or CI) diff the two palettes.

## Checked and fine

- **Landmarks:** `header`, `main`, `search` and `footer` are all present, and `lang="pl"` is set.
- **Labels:** the search label and hint are wired with `htmlFor` and `aria-describedby`.
- **Focus:** a 3px `--focus` outline is on every focusable element.
- **Tap targets:** every one is 48px or more.
- **Contrast:** all AA pairs pass per `design/tokens.md`.
- **Waste chips:** they use the `-fg` pairs, and zmieszane has a visible border in dark mode.
- **Theme flash:** none, because the inline head script sets `data-theme` before paint and `suppressHydrationWarning` is on `<html>`.
- **Hydration:** both `useSyncExternalStore` server snapshots (`null` and `"dark"`) match the static HTML, so there is no mismatch warning, only the shift in item 1.
