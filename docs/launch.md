# Launch

## Indexing: one switch

`web/lib/indexing.ts` decides whether search engines may index the site: only a production deployment without `SITE_BASIC_AUTH`. It drives the `X-Robots-Tag` header (`web/next.config.ts`), meta robots (`web/app/layout.tsx`) and `robots.txt` (`web/app/robots.ts`). Preview, local and CI builds are never indexable, and while the gate is on `web/proxy.ts` adds `noindex` and answers `/robots.txt` itself.

To launch: remove `SITE_BASIC_AUTH` from Production in Vercel, then redeploy (headers, robots and redirects are fixed at build time). Preview stays gated.

`conaulicy.vercel.app` always redirects (308, path and query kept) to `https://conaulicy.pl`; other hosts, such as preview URLs, are not redirected.

CI checks both builds: `web/scripts/check-indexing.mjs --expect=noindex|index`.

## Sitemap

`/sitemap.xml` (`web/app/sitemap.ts`) lists the four static pages (`/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`) and one `/adres/<id>` per place in the search index, as each page's canonical URL. It never lists the house-number variants (`/adres/<id>/nr/…`, canonicalised to the street), the number-error page (`/numer`, meta robots `noindex`), street PDFs or calendars (both `X-Robots-Tag: noindex`). It is empty unless the site is indexable, and `robots.txt` names it only then.

Caching: no database read of its own. It reads the cached search index (`searchIndex()` in `web/lib/schedule.ts`), is rendered at build, served from the CDN, refreshed hourly (`revalidate = 3600`, as the data cache) and purged by `POST /api/revalidate` through the `dataset` tag after an import.

After launch: submit `https://conaulicy.pl/sitemap.xml` in Google Search Console.
