# 01 — Hello world on Vercel

18 Oct 2026. Team `gdzie-zamieszkac` only. No purchases. Route 53 was not changed from this repo.

## Production

| | |
|---|---|
| Project | `conaulicy` |
| Project ID | `prj_Q4z7gR2LaKbpNcrIrnNoLHRpdbsu` |
| Deployment | `dpl_32JQSqXd2fSjduFJQLS2QfXxHY5A` |
| Git | `lbn21/conaulicy` `main` (`ca0a62c`) |
| Framework | Next.js, root directory `web` |
| Function region | `fra1` |
| Node.js on Vercel | `24.x` (newest major Vercel supports for builds and functions) |
| Production URL | https://conaulicy.vercel.app |
| Apex | https://conaulicy.pl |

`https://conaulicy.vercel.app` and `https://conaulicy.pl` both return **200**, the page text “Hello world”, `<meta name="robots" content="noindex, nofollow">`, and `X-Robots-Tag: noindex, nofollow`. `robots.txt` is `Disallow: /`.

## Domains (Vercel project, not DNS)

- `conaulicy.pl` is the primary domain (no redirect).
- `www.conaulicy.pl` redirects with **308** to `https://conaulicy.pl/`.

Vercel’s recommended records (rank 1), from `GET /v6/domains/conaulicy.pl/config` on 18 Oct 2026:

| Host | Type | Value |
|---|---|---|
| apex | A | `216.150.1.1` |
| apex | A | `216.150.16.1` |
| apex, if the DNS host can ALIAS/ANAME an external name | ALIAS / CNAME | `075887b93629395c.vercel-dns-016.com` |
| `www` | CNAME | `075887b93629395c.vercel-dns-016.com` |

Vercel also listed a rank-2 fallback: apex A `76.76.21.21`, CNAME `cname.vercel-dns.com`. Rank 1 is what was used.

## DNS (Tech Lead, not this agent)

The Tech Lead added the records in Route 53 zone `Z038133013GA1DDSHXFPJ`. This agent did not call AWS.

- Apex A: `216.150.1.1` and `216.150.16.1`
- `www` CNAME: `075887b93629395c.vercel-dns-016.com`
- TTL 300

Checked at 23:50 Europe/Warsaw, resolver 8.8.8.8: those A and CNAME values are what resolve. `http://conaulicy.pl` returns **308** to `https://conaulicy.pl/`. The apex certificate is Let’s Encrypt, `CN=conaulicy.pl`, issued 18 Oct 2026, expires 16 Jan 2027.

The Tech Lead reported that the `www` certificate was still being issued. A check a few minutes later found Let’s Encrypt `CN=www.conaulicy.pl` (same dates) and `https://www.conaulicy.pl` returning **308** to `https://conaulicy.pl/`.

## Versions (latest stable, no canary/beta/rc)

Installed in `web/package.json`:

| Package | Version |
|---|---|
| next | 16.4.2 |
| react | 19.3.1 |
| react-dom | 19.3.1 |
| tailwindcss | 4.3.3 |
| @tailwindcss/turbopack | 4.3.3 |
| typescript | 7.0.2 |
| @biomejs/biome | 2.5.15 |
| @types/node | 24.19.2 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |

Local install used Node `v24.7.0`. The newest Node 24 release on nodejs.org at that time was `v24.22.0`. Vercel is pinned to `24.x` and applies its own patch. Node 26 is not available for Vercel builds or functions.

Formatting and linting: Biome (`npm run lint`, `npm run format`). No ESLint. No Prettier.

## Not done

- Task-11 Step 1 (design proposals) was paused until this report was pushed.
- Basic Auth is not on. The page is a placeholder with noindex.
- No paid Vercel add-on was enabled. Function CPU stays `standard`.
