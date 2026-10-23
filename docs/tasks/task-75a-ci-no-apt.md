# Task 75a: no apt in the CI hot path

Approved by Jakub, 23 Oct 2026.

## Why

- `npx playwright install --with-deps chromium` runs `apt-get update` and installs packages every run. 13 of 193 installs took over 5 min (up to 12 min) on 22–23 Oct: slow `azure.archive.ubuntu.com` mirrors.
- In job 120451822960 every Chromium shared library was already the newest version. The only new packages were CJK/X fonts (`fonts-ipafont-gothic`, `fonts-wqy-zenhei`, `fonts-unifont`, `fonts-freefont-ttf`, `tlwg`, `xfonts-*`) and `xvfb`. The browser itself comes from the `ms-playwright` cache. Our fallback font, Liberation Sans (`web/app/tokens.css`), is preinstalled.
- The poppler-utils apt step also stalled (up to 96 s).

## Do (only `.github/workflows/ci.yml`)

1. `web` and `perf` jobs: `npx playwright install chromium`, no `--with-deps`. Keep the `ms-playwright` cache step.
2. poppler-utils (`web` job): not preinstalled on the runner (every run installs it), and no PDF text extractor in our dependencies (`pdfkit` only writes PDFs). So cache its `.debs` with `actions/cache`, keyed on runner OS + poppler-utils version: on a miss, `apt-get update` and download the missing packages once; on a hit, `sudo dpkg -i` the cached debs, with no `apt-get update` and no network.
3. Nothing else: Lighthouse, `check-perf*`, the indexing check, the paths filter and `setup-java` are separate PRs.

## Prove it

Open a PR (do not merge). Every step passes (axe, search popup, fonts, PDF, Lighthouse, the rest) without the apt deps. Re-run once to get a cache hit, and quote the log showing the hit path did no apt work. Report Install Chromium and poppler durations against the baseline: Install Chromium median 25 s / p90 105 s, poppler median 5 s / p90 7 s.
