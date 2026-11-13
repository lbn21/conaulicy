# Launch

## Indexing: one switch

`web/lib/indexing.ts` decides whether search engines may index the site: only a production deployment. It drives the `X-Robots-Tag` header (`web/next.config.ts`), meta robots (`web/app/layout.tsx`) and `robots.txt` (`web/app/robots.ts`). Preview, local and CI builds are never indexable; Previews are behind Vercel's Deployment Protection. No Basic Auth gate (t416).

`conaulicy.vercel.app` always redirects (308, path and query kept) to `https://conaulicy.pl`; other hosts, such as preview URLs, are not redirected.

CI checks the CI build as served (`web/scripts/check-indexing.mjs --expect=noindex`), and unit-tests the production settings of `next.config.ts` headers and redirects and `robots.txt` (`web/lib/next-config.test.ts`). Before launch, check a production-like build by hand: `VERCEL_ENV=production npm run build`, then `node scripts/check-indexing.mjs --expect=index` (the sitemap complete, every URL in it indexable).

No Vercel WAF at launch. Every page and file is prerendered: a query string changes nothing, and an unknown URL is the prerendered 404 from Vercel's routing layer, no function run (t416).

## Sitemap

`/sitemap.xml` (`web/app/sitemap.ts`) lists the four static pages (`/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`) and one `/adres/<id>` per place in the search index, as each page's canonical URL. It never lists a query, street PDFs or calendars (both `X-Robots-Tag: noindex`). It is empty unless the site is indexable, and `robots.txt` names it only then.

`robots.txt` shuts out SEO and backlink crawlers (`BLOCKED_BOTS` in `web/app/robots.ts`: SE Ranking, Ahrefs, Semrush and others); every other crawler keeps access but `/api/`.

Caching: no database read of its own. It reads the search index (`searchIndex()` in `web/lib/schedule.ts`), is prerendered at build and re-rendered with the `dataset` tag; a new place set is a new deployment, so it never lists a page the build did not make.

After launch: submit `https://conaulicy.pl/sitemap.xml` in Google Search Console.
