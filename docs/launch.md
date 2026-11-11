# Launch

## Indexing: one switch

`web/lib/indexing.ts` decides whether search engines may index the site: only a production deployment without `SITE_BASIC_AUTH`. It drives the `X-Robots-Tag` header (`web/next.config.ts`), meta robots (`web/app/layout.tsx`) and `robots.txt` (`web/app/robots.ts`). Preview, local and CI builds are never indexable, and while the gate is on `web/proxy.ts` adds `noindex` and answers `/robots.txt` itself.

To launch: remove `SITE_BASIC_AUTH` from Production in Vercel, then redeploy (headers, robots and redirects are fixed at build time). Preview stays gated.

`conaulicy.vercel.app` always redirects (308, path and query kept) to `https://conaulicy.pl`; other hosts, such as preview URLs, are not redirected.

CI checks the CI build as served (`web/scripts/check-indexing.mjs --expect=noindex`), and unit-tests the production settings of `next.config.ts` headers and redirects and `robots.txt` (`web/lib/next-config.test.ts`). Before launch, check a production-like build by hand: `VERCEL_ENV=production npm run build`, then `node scripts/check-indexing.mjs --expect=index` (the sitemap complete, every URL in it indexable).

No Vercel WAF at launch; on the cacheable page and API routes, unknown query parameters are redirected to the clean URL; files and Next.js metadata routes keep their query.

## Sitemap

`/sitemap.xml` (`web/app/sitemap.ts`) lists the four static pages (`/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`) and one `/adres/<id>` per place in the search index, as each page's canonical URL. It never lists a house number (`/adres/<id>?nr=…`, canonicalised to the street), the number error (an empty `?nr=`, meta robots `noindex`), street PDFs or calendars (both `X-Robots-Tag: noindex`). It is empty unless the site is indexable, and `robots.txt` names it only then.

`robots.txt` shuts out SEO and backlink crawlers (`BLOCKED_BOTS` in `web/app/robots.ts`: SE Ranking, Ahrefs, Semrush and others), as each fetch of an address page is a function invocation; every other crawler keeps access but `/api/`.

Caching: no database read of its own. It reads the cached search index (`searchIndex()` in `web/lib/schedule.ts`), is rendered at build, served from the CDN, refreshed hourly (`use cache` with the `dataset` profile in `web/next.config.ts`, as the data cache) and purged by `POST /api/revalidate` through the `dataset` tag after an import.

After launch: submit `https://conaulicy.pl/sitemap.xml` in Google Search Console.
