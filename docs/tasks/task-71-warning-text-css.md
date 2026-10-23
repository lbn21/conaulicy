# Task 71: the address page's warning text is unstyled (missing GOV.UK component CSS)

Reported by Jakub, 23 Oct 2026, on prod: on /adres pages with unverified dates, the warning under "Pokaż więcej terminów" shows in the browser's serif font, bold, with a bare "!" (no circle).

## Root cause (evidenced)

- #86 (a10d7ac, task 64) moved `UNVERIFIED_NOTE` out of the inset into GOV.UK Warning text in `components/place-page.tsx` (`govuk-warning-text`, `__icon`, `__text`).
- `web/app/govuk.scss` imports GOV.UK Frontend components one by one, and `govuk-frontend/dist/govuk/components/warning-text` was never added. The shipped CSS has no `govuk-warning-text` rule: not now (3bm5rp27u8r-n.css), and not before #94 either (0faotvfz8k60a.css, 23 Oct 14:40). The markup is unchanged and correct. #94 and #95 did not cause this.
- No CI check compares the classes the pages use with the CSS that ships, so nothing failed.

## 1. Fix

Add `@use "govuk-frontend/dist/govuk/components/warning-text";` to `web/app/govuk.scss`, in the existing list, before `utilities`/`overrides`. Do not change the markup or `site.scss`. The result must be GOV.UK Frontend 6.5.1's own warning text: the GOV.UK font, the black circle with the white "!", and the bold text beside it.

## 2. CI guard: every class used exists in the CSS

Extend `web/scripts/check-own-css.mjs`. It already compiles our Sass and scans the pages' classes, and it already runs in CI with no build.

- Compile `app/govuk.scss` and `app/site.scss` with `sass` as the script already does, and include `app/tokens.css`. Collect every class selector (`.name`) from the output.
- Collect every `govuk-*` and `app-*` class used in `app/**/*.tsx` and `components/**/*.tsx`: `className` string and template literals, and class strings passed through variables or conditionals. Reuse the scan the script already does for utility classes.
- Fail if any used class has no rule, and name the class and the file.
- Keep a short explicit allowlist of hook-only classes, each with a reason. Today these are `govuk-template__header` and `govuk-template__footer` (template.njk hooks, unstyled in GOV.UK Frontend), `govuk-generic-header__container` (only its `--full-width` modifier is styled) and `app-logo` (only its `__plate`/`__wordmark` children are styled). Do not use wildcards.
- Prove the guard works: in the PR body, show that the check fails on main without the `@use` (paste the failure line) and passes with it.

This is a static check, not Playwright computed styles: it needs no browser or build, runs in about a second, and catches every missing component, not only this one.

## Tests

- All CI green.
- PR body: root cause, the guard's failing and passing output, and the allowlist.

## Rules

- No `npm run db:*`. No local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Running `node scripts/check-own-css.mjs` locally is fine: it uses no env and no database.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `fix/warning-text-css` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
