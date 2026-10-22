# Launch

## Indexing: one switch

`web/lib/indexing.ts` decides whether search engines may index the site: only a production deployment without `SITE_BASIC_AUTH`. It drives the `X-Robots-Tag` header (`web/next.config.ts`), meta robots (`web/app/layout.tsx`) and `robots.txt` (`web/app/robots.ts`). Preview, local and CI builds are never indexable, and while the gate is on `web/proxy.ts` adds `noindex` and answers `/robots.txt` itself.

To launch: remove `SITE_BASIC_AUTH` from Production in Vercel, then redeploy (headers, robots and redirects are fixed at build time). Preview stays gated.

`conaulicy.vercel.app` always redirects (308, path and query kept) to `https://conaulicy.pl`; other hosts, such as preview URLs, are not redirected.

CI checks both builds: `web/scripts/check-indexing.mjs --expect=noindex|index`.
