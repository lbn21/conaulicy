# Task 69: `/szukaj` layout, and no custom prefill JS

Approved by Jakub, 23 Oct 2026. Follow-up to PR #91 (task 68).

## 1. Layout: the field above the results

GOV.UK search results pattern: H1, then the search box, then the result count and the list.

- `many`: error-free. H1 „Wyniki wyszukiwania”, then `<AddressSearch … value={q}>`, then „Dla „…” znaleźliśmy …” and the list.
- `none`: H1 „Brak wyników”, then the field, then „Nie znaleźliśmy …” and the advice list.
- `empty`: the error summary stays first in `<main>`, then H1 „Wyszukaj adres”, then the field in its error state.
- Headings: the field's label is a `govuk-label` (not a heading), so the order stays H1 → content with no level jump. Don't add headings. Adjust spacing with GOV.UK spacing classes only.
- `outcome()`, the 308s, titles and robots stay unchanged.

## 2. Remove the first-focus "clear and refill" JS from #91

Our rule: no custom focus, keyboard or scroll JS. In `web/components/address-search.tsx`, delete the #91 block that empties the field, dispatches `input`, waits a tick and refills it.

What accessible-autocomplete 3.0.2 does (`node_modules/accessible-autocomplete/src/autocomplete.js`):
- With `defaultValue`, the constructor sets `options: [defaultValue]` and `query: defaultValue` (l. 69–70).
- `handleInputFocus` reopens the menu when `options.length > 0` (l. 253–260), so focus shows the bare text as the only "suggestion". That was #91's CI failure.
- `source` is called only when the query changes, or always with `showAllValues` (l. 218–232). `showAllValues` adds a dropdown arrow and `source('')` on focus/arrow, which is wrong for us.
- `minLength` can't help: raising it blocks real searches.

Preferred solution, with no new code: don't pass `defaultValue`. The server already renders the placeholder input with `value="…"`. The component's existing handover from before #91 (text in the placeholder when the library loads → copied into the library's field, then one `input` event, the same code home uses for text typed while loading) carries the prefilled value. The library then searches it like typed text, so the suggestions are real places, and the text appears once. Revert that part to its pre-#91 form, and make sure the prefilled text is not doubled.

If that can't work without new focus/keyboard code, fall back to: `defaultValue` only, no handler. Suggestions then appear when the user types. Accept the bare-text option on focus only if you can't avoid it, and explain why.

Either way:
- Don't add any `focus`, `focusin`, `keydown`, `click` or `scroll` listener beyond the one that existed before #91. That is the existing `focusin` that loads the library and the index; it stays.
- Explain the choice and the library behaviour (with line refs) in the PR body and in a short code comment.
- Update `check-search.mjs` to match: `/szukaj?q=adama` enhanced shows the text once, and no duplicated `name=q`. Assert suggestions on focus only if the chosen solution gives them.

## Tests

- `check-query.mjs`: on `/szukaj?q=adama` and `?q=xyzqq` the `<search>` form comes before the results text or list in the HTML. On `?q=` the error summary comes before the H1, the H1 before the form, and the error state stays as in #91. The other #91 checks stay.
- All of CI green (web, perf, a11y, W3C, check-query, check-search).

## Rules

- No `npm run db:*`, and no local `next build`/`start`/`dev`/`check:*` that reads `web/.env.local`. Rely on CI.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `feat/szukaj-layout` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
