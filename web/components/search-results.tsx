"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect } from "react";
import { browser } from "react-dom";
import { ResultsSkeleton } from "@/components/search-skeleton";
import { withHouseNumber } from "@/lib/house";
import { addresses, placeHref, type SearchHit } from "@/lib/search";
import { loadedIndex, loadIndex } from "@/lib/search-index";
import { type Outcome, outcomeOf, searchQuery } from "@/lib/search-submit";
import { ALL_PLACES } from "@/lib/static-pages";

// /szukaj's results, under its heading and field (app/szukaj/page.tsx): the
// page is static, from the CDN, and this part is rendered on the device
// only, inside the page's <Suspense>, its fallback in the HTML:
// use(browser()) keeps it off the server even when the query is known there
// (the IMGW banner's request-time render), as it matches over an index only
// the browser has (react.dev/reference/react-dom/browser;
// nextjs.org/docs/app/guides/single-page-applications, "Rendering
// components only in the browser"). The query is matched over the search
// field's own index (lib/search-index.ts, lib/search-submit.ts), so /szukaj
// and „Szukaj” decide alike: after „Szukaj” the index is in memory and the
// results are drawn at once; on a direct visit, behind a skeleton until it
// loads (read with use()); if it cannot load, /api/search's answer instead.
// One clearly best place (a direct visit only: „Szukaj” goes there itself):
// straight to its page, replacing /szukaj in the history.

async function find(indexUrl: string, q: string): Promise<Outcome> {
  try {
    return outcomeOf(await loadIndex(indexUrl), q);
  } catch {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hits = (await res.json()) as SearchHit[];
    return hits.length === 0 ? { kind: "none", q } : { kind: "many", q, hits };
  }
}

// One promise per index and query, made outside render and reused
// (react.dev/reference/react/use, "Caching Promises for Client Components").
const outcomes = new Map<string, Promise<Outcome>>();
function outcome(indexUrl: string, q: string): Promise<Outcome> {
  const key = `${indexUrl}\n${q}`;
  let promise = outcomes.get(key);
  if (!promise) {
    promise = find(indexUrl, q);
    outcomes.set(key, promise);
  }
  return promise;
}

/** What was found; one clear place: straight to its page. */
function Results({ result }: { result: Outcome }) {
  const router = useRouter();
  // Keeps the house number: "Asnyka 5" → /adres/…?nr=5.
  const target = result.kind === "one" ? placeHref(result.hit) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (result.kind === "many")
    return (
      <>
        <p className="govuk-body">
          {`Dla „${result.q}” znaleźliśmy ${addresses(result.hits.length)}. Wybierz swój.`}
        </p>
        <ul className="govuk-list">
          {result.hits.map((hit) => (
            <li key={hit.id}>
              <a href={placeHref(hit)} className="govuk-link">
                {withHouseNumber(hit.label, hit.nr ?? null)}
              </a>
            </li>
          ))}
        </ul>
      </>
    );
  if (result.kind === "none")
    return (
      <>
        <p className="govuk-body">{`Nie znaleźliśmy „${result.q}”.`}</p>
        <p className="govuk-body">Możesz:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>sprawdzić, czy nazwa jest dobrze napisana</li>
          <li>wpisać samą nazwę ulicy, na przykład Asnyka</li>
          <li>
            znaleźć swój adres na liście{" "}
            <a href={ALL_PLACES.path} className="govuk-link">
              {ALL_PLACES.text}
            </a>
          </li>
        </ul>
      </>
    );
  // The one place's page is opening.
  return <ResultsSkeleton />;
}

/** The results once the index (or the server) has answered. */
function Pending({ indexUrl, q }: { indexUrl: string; q: string }) {
  return <Results result={use(outcome(indexUrl, q))} />;
}

/** The results for ?q=; nothing without a query. */
export function SearchResults({ indexUrl }: { indexUrl: string }) {
  use(browser("The results are matched over the index in the browser."));
  const q = searchQuery(useSearchParams().get("q"));
  if (!q) return null;
  const index = loadedIndex(indexUrl);
  if (index) return <Results result={outcomeOf(index, q)} />;
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <Pending indexUrl={indexUrl} q={q} />
    </Suspense>
  );
}
