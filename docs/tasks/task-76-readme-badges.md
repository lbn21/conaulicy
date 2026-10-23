# Task 76: README badges

Requested by Jakub, 23 Oct 2026. One small PR, not merged by the agent.

## Goal

Show at a glance, at the top of `README.md`, whether CI on `main` is green and under which licence the code is published.

## Change

Two badges just under the title of `README.md`, alt text in Polish:

1. **CI on `main`**: GitHub's native workflow badge, `.github/workflows/ci.yml` (`/actions/workflows/ci.yml/badge.svg?branch=main`), linking to that workflow's runs filtered to `main`. CI runs on push to `main` since task 75f, so the badge reflects `main`.
2. **Licence AGPL-3.0-or-later**: links to `LICENSE`. GitHub has no native licence badge, and a self-hosted SVG would add a file, so it is a shields.io static badge (`img.shields.io/badge/licencja-AGPL--3.0--or--later-blue`). GitHub serves README images through its own image proxy (camo), so readers never request shields.io directly. This concerns the repository only; the site still makes no third-party requests.

Nothing else in the README changes. No site code changes.

## Acceptance criteria

- The diff is `README.md` (2–4 added lines) plus this brief.
- Both badges render in the PR's README preview; the CI badge links to the `ci.yml` runs on `main`, the licence badge to `LICENSE`.
- PR CI is green.
- Not merged by the agent.
