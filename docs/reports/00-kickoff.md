# 00 — Kickoff

19 Oct 2026. Hello world is live at https://conaulicy.pl (also https://conaulicy.vercel.app). Both return 200, noindex. Draft PR: https://github.com/lbn21/conaulicy/pull/1

## Versions

Installed in `web/package.json`. Latest stable at hello-world time; no canary, beta, or rc.

| Package | Version |
| --- | --- |
| next | 16.4.2 |
| react / react-dom | 19.3.1 |
| tailwindcss | 4.3.3 |
| typescript | 7.0.2 |
| @biomejs/biome | 2.5.15 |

Local Node `v24.7.0`. Vercel builds and functions use Node `24.x`.

## Direction

Latarnia was chosen on 2026-10-19. Atkinson Hyperlegible Next 400/700, self-hosted. Accent `#ffb547` (dark) / `#9a5700` (light). `design/proposals/` keeps both Latarnia and Bez as samples, not the final UI.

Tokens live in `design/tokens.css` (not imported by the app yet). Dark is the default; light follows `prefers-color-scheme`, and `[data-theme]` overrides it. `node design/contrast.mjs` exits 0: body text is AAA, every required text pair is at least AA (4.5:1), and UI pairs are at least 3:1. A few non-body pairs miss AAA only (light muted text on `surface-2`, text on the light accent, light status colours, and most waste labels).

## Allowlist

`.cursor/cli.json` allows workspace read/write, everyday shell commands (`git`, `gh`, `npm`, `npx`, `node`, `biome`, `python3`, and basic file tools), read-only `vercel` inspect/logs, and doc fetches. Deny covers `.env`, force-push, hard reset, AWS, Vercel deploy/domains/DNS/billing, and publishing.

## Next

Next step is waste-pickup data and ETL, then the UI by Opus, using these tokens.
