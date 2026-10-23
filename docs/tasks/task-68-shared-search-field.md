# Task 68: one search field on `/` and `/szukaj`

Approved by Jakub, 23 Oct 2026. He reported it: `https://conaulicy.pl/szukaj?q=` renders a plain `<input id="adres" name="q" class="govuk-input govuk-input--error">` with an error summary, but no autocomplete. The home page uses accessible-autocomplete. GOV.UK pattern: the search box on a results page is the same component as on the start page.

## Today

- `web/components/address-search.tsx` (`AddressSearch`, client): GET form to `/szukaj`, label, hint, a static placeholder input `name=q`, „Szukaj” button. On first focus it loads accessible-autocomplete 3.0.2 and the index (`/api/search-index/<version>`, matched on the device with `web/lib/search.ts`; falls back to `/api/search`).
- `web/app/szukaj/page.tsx` has its own `SearchForm` (lines 70–109), a forked copy of the field with the error state and `defaultValue`, but with no autocomplete.

## Do

1. **One component.** Make `AddressSearch` the only search field and delete `SearchForm`. It gets the optional props `value` (string, default `""`) and `error` (string | null). `/` renders `<AddressSearch indexUrl={…} />` as today. `/szukaj` renders `<AddressSearch indexUrl={await searchIndexUrl()} value={q} error={…} />` in the place `SearchForm` was. The label, hint text, ids (`adres`, `adres-label`, `adres-hint`, `adres-error`), button and `<search id={SEARCH_ID}>` wrapper are defined once, in the component. No second copy of the markup or search logic anywhere.
2. **Server-rendered, no JS.** The SSR HTML of both pages is the same form: `form method=get action=/szukaj`, label, hint, `input id=adres name=q`, „Szukaj” button. With `value`, the placeholder input carries `value="…"` (HTML-escaped; the placeholder is a raw HTML string today, so escape it). With `error`, it follows GOV.UK error markup:
   - `govuk-form-group--error` on the form group;
   - `<p id="adres-error" class="govuk-error-message"><span class="govuk-visually-hidden">Błąd:</span> …</p>` between the hint and the field;
   - `govuk-input--error` on the input;
   - `aria-describedby="adres-hint adres-error"`.

   The error summary stays in the page (`/szukaj`), above the h1, linking to `#adres`, as today.
3. **With JS, the same enhancement as home, unchanged in behaviour.** Fill-only on select (no `onConfirm`), `autoselect: true`, `confirmOnBlur: false`, no custom keyboard, scroll or focus JS beyond what exists today. A house number typed after a suggestion is kept (task 65/66 behaviour).
   - **Prefill:** use the library's `defaultValue`, not the "typed text" handover. Make sure the prefilled text is not duplicated: today `start()` appends `old.value` to the new field.
   - **Error state on the enhanced field:** `inputClasses: "govuk-input govuk-input--error"` (and keep `hintClasses` consistent) so the red border survives enhancement. The form group keeps `govuk-form-group--error`.
   - **Hint and error for screen readers once enhanced:** 3.0.2 sets the input's `aria-describedby` itself (only its assistive hint, only while the query is empty) and has no option to add ids. So don't patch the DOM it owns. Put the error text first, then the hint, in `tAssistiveHint` (a documented option), and say so in a comment. If you find a documented way to keep `adres-hint adres-error` in `aria-describedby`, use that instead.
   - Update the stale comment in `address-search.tsx` that says this field does not use `defaultValue`.
4. **`/szukaj` page logic unchanged:** `outcome()`, 308 for one clear place, the lists, titles (`Błąd: …`) and robots stay as they are. Note: `q=Rynk` is one clear match (308 to ul. Rynek), so use `q=adama` (many results, 200) for the prefilled-list case.

## Tests (CI)

- Add no-JS HTML checks to the existing check scripts (e.g. `check-html.mjs` or `check-query.mjs`, whichever already fetches `/szukaj` from the CI build). They run against the CI fixture build only.
  - `/szukaj?q=` → 200: error summary with `href="#adres"`, `govuk-form-group--error`, `id="adres-error"`, input `name="q"` with `govuk-input--error` and `aria-describedby` containing `adres-error`, empty value.
  - `/szukaj?q=adama` → 200: a results list, and the input `name="q"` with `value="adama"`, no error classes.
  - `/` and `/szukaj?q=adama` render the same form markup (same label, hint, ids, button, `<search>` wrapper).
- All existing `check-query` cases stay green, as do the a11y (axe) and W3C HTML checks. If the a11y check drives the enhanced field on `/`, add the same for `/szukaj?q=` (error state) and `/szukaj?q=adama` (prefilled).

## Rules

- No `npm run db:*`, and no local `next build`/`start`/`dev` or `check:*` that reads `web/.env.local` (production). Rely on CI.
- Never `vercel env run`. No force-push. Stop on any safety block and report.
- Never touch `~/projects/conaulicy`.
- Branch `feat/shared-search-field` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number and a short summary. Do not merge.
