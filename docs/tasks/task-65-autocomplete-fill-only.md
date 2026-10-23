# Task 65: suggestions only fill the field; the form submits (GOV.UK default)

Approved by Jakub, 23 Oct 2026, after a phone test. Branch: `fix/autocomplete-fill-only` from the latest `origin/main` (a10d7ac or later): `git fetch && git switch main && git pull --ff-only && git switch -c fix/autocomplete-fill-only`.

## Problem (live)
- Picking a suggestion on the home page navigates at once (`onConfirm` → `window.location.assign(placeHref(option))` in `web/components/address-search.tsx`).
- On a phone the open suggestion list (overlay) hides the „Szukaj” button.

## Wanted: accessible-autocomplete's GOV.UK default (onConfirm = noop, the parent form's button submits)
1. Picking a suggestion (tap, click, or arrow + Enter) only fills the input with the suggestion's label and closes the list. No navigation in JS. Remove the `location.assign` `onConfirm` and any custom code that only existed for it (e.g. `placeHref` use on the client if now unused). The „Szukaj” button is visible again once the list closes.
2. Submitting the form (button, or native Enter when the list is closed) goes to `/szukaj?q=<label>`. `/szukaj` must resolve an **exact suggestion label** straight to its single place with 308, never to a multi-result list, e.g.:
   - „Lubasy (Basznia Dolna, gm. Lubaczów)”
   - „Basznia (Basznia Dolna, gm. Lubaczów)” vs „Basznia Górna (gm. Lubaczów)”
   - „ul. Rynek, Lubaczów” → `/adres/0972447-19253`
   - „ul. Adama Asnyka 12, Lubaczów” → `/adres/0972447-00470?nr=12`
   (use the real labels from the index; the field value after picking must be exactly what /szukaj resolves – check `inputValueTemplate` / `optionText`). Exact label match first (normalised the same way as search: case, diacritics, whitespace), with the house number carried as today; otherwise the existing fuzzy search.
3. Keep `autoselect` as is unless you find a better native option (document). Behaviour to document in the component comment and PR: Enter with the list open picks the highlighted suggestion (fills only), the next Enter submits the form natively. No custom keydown handlers. `confirmOnBlur` stays as is unless needed (document).
4. Tests:
   - unit test (lib, no DB): exact-label resolution for **every** place in a dataset — every label from the search index resolves to its own id (in CI also run against the CI fixture's full index, e.g. in `check-search`/`check-query`: every `/api/search-index` label → `/szukaj?q=<label>` 308 to its own id), plus a few labels with house numbers (→ `?nr=`).
   - e2e (`check-search`): tapping/clicking a suggestion does not navigate; the field contains the label; clicking „Szukaj” lands on the street page; keyboard ArrowDown/Enter/Enter lands on the street page; the no-JS flow is unchanged.
5. No layout shift (CI CLS check still 0). No new client JS beyond removing code.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets. No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only: no custom scroll/focus/keyboard JS; links never open new tabs. Minimal code, scope only.

## Done
Commits on `fix/autocomplete-fill-only` (this brief included), PR titled "Suggestions fill the field; the form opens the place", body summarising changes and decisions. Wait for CI green (`gh pr checks --watch`), fix failures. Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration and decisions.
