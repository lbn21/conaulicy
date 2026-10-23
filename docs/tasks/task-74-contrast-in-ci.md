# Task 74: run design/contrast.mjs in CI, and let no colour token escape it

Approved by Jakub, 23 Oct 2026.

## Why

`design/contrast.mjs` is our WCAG contrast check (it exits 1 when a required pair is below its threshold), but nothing runs it. CI never has, so a palette or token change can ship a failing pair. It also has a blind spot:

- It reads `web/app/tokens.css` with a regex that only accepts 6-digit hex `--waste-*` values.
- So any other colour token is silently skipped: a non-`waste-` name, 3- or 8-digit hex, `rgb()`/`hsl()`, a keyword such as `transparent`, or a `var()`.
- Today that already happens to `--waste-elektro-border: transparent`. The script never sees it, so elektro is treated as having no outline.

## Do (minimal, no new dependencies)

1. **CI step.** Add one step to the existing `web` job in `.github/workflows/ci.yml`, right after "Own CSS (GOV.UK classes only, site.scss capped)" and before the database or build steps: `name: "Contrast (WCAG pairs, every colour token checked)"`, `run: node ../design/contrast.mjs`. The job's working directory is `web`.
   - No new job. No build or DB needed.
   - It must fail the job on any failing pair, which the script's exit 1 already does.
2. **Every colour token accounted for.** In `design/contrast.mjs`:
   - Collect **every custom property in `web/app/tokens.css` whose value is a colour**: any hex, `rgb[a]()`, `hsl[a]()`, a CSS colour keyword including `transparent`/`currentColor`, or a `var()` to another token. Not just `--waste-*` with 6-digit hex.
   - Each one must either appear in at least one pair that `requiredPairs()` checks (as "text" or "ui"; "info"-only does not count), or be in a small explicit allowlist, `NOT_CHECKED = new Map([[token, reason], …])`, with a one-line reason per entry ("not text or UI because …").
   - The script fails (exit 1, with a clear message) if any of these is true:
     - a colour token is in neither;
     - an allowlisted token is now in a checked pair (stale entry: remove it);
     - an allowlisted token is no longer in `tokens.css`.

     This is the same stale-proof pattern as `HOOK_ONLY` in `web/scripts/check-own-css.mjs`.
   - A colour token whose value can't be checked (e.g. `transparent`) cannot be in a pair. It must be allowlisted with its reason, or handled explicitly. Decide `waste-elektro-border: transparent` deliberately: probably allowlisted ("no outline: the dark fill carries the 3:1 itself") while `waste-elektro` stays a checked UI pair. Check the current OUTLINED logic still treats elektro that way.
   - Keep the allowlist as short as the truth allows. Do not allowlist a real text/UI colour to get green; if one fails, report it and stop.
   - Keep the output table; add a short line summarising tokens checked and allowlisted.
3. **Docs.** Update the header comment of `contrast.mjs`, the `docs/brand.md` contrast section ("computed by `node design/contrast.mjs`…": now also run in CI), and the comment at the top of `web/app/tokens.css`. Change comments only in `web/`: no runtime change in `web/app` or `web/components`.

## Prove it (in the PR description)

Run locally with plain `node design/contrast.mjs`. It reads no env and needs no build. Paste the exit codes and the relevant lines for:

1. a deliberately failing pair, e.g. temporarily set `--waste-opony-border` to `#c0c4cc`, giving exit 1 with the FAIL line;
2. a new unlisted token, e.g. temporarily add `--waste-test: rgb(200 200 200);`, giving exit 1 with the "not checked" message;
3. a stale allowlist entry (allowlist a token that is in a checked pair, or one not in tokens.css), giving exit 1;
4. the real tree, giving exit 0 and the summary line.

Revert all the temporary edits before committing; none of them may land.

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Plain `node design/contrast.mjs` and `node scripts/check-own-css.mjs` are fine.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `ci/contrast` (this brief is its first commit). Open a normal PR, wait for CI (the new step must run and pass in the `web` job), report the PR number. Do not merge.
