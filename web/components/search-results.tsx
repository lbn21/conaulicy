"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef } from "react";
import { browser } from "react-dom";
import { AddressSearch } from "@/components/address-search";
import { ErrorSummary } from "@/components/error-summary";
import { HeadingSkeleton, ResultsSkeleton } from "@/components/search-skeleton";
import { withHouseNumber } from "@/lib/house";
import {
  addresses,
  exactPlace,
  MAX_QUERY_LENGTH,
  placeHref,
  type SearchHit,
} from "@/lib/search";
import { loadIndex } from "@/lib/search-index";
import { ALL_PLACES } from "@/lib/static-pages";

// /szukaj's column (app/szukaj/page.tsx): the page is static, from the CDN,
// and this part is rendered on the device only, inside the page's
// <Suspense>, its fallback in the HTML: use(browser()) keeps it off the
// server even when the query is known there (the IMGW banner's request-time
// render), as it matches over an index only the browser has
// (react.dev/reference/react-dom/browser;
// nextjs.org/docs/app/guides/single-page-applications, "Rendering
// components only in the browser"). The query is matched over the search field's own index
// (lib/search-index.ts, read with use()), so /szukaj and the field rank
// alike; if it cannot load, /api/search's answer instead. One clearly best
// place: straight to its page (Location.replace, a full load as any link:
// developer.mozilla.org/docs/Web/API/Location/replace); otherwise the
// ranked list; none: what to try next. GOV.UK's search results: the
// heading, the same field holding the query, then the results.

const EMPTY_ERROR = "Wpisz nazwę ulicy albo wsi";

const H1 = {
  empty: "Wyszukaj adres",
  none: "Brak wyników",
  many: "Wyniki wyszukiwania",
} as const;

type Outcome =
  | { kind: "none"; q: string }
  | { kind: "one"; hit: SearchHit }
  | { kind: "many"; q: string; hits: SearchHit[] };

async function find(indexUrl: string, q: string): Promise<Outcome> {
  let hits: SearchHit[];
  try {
    const { places, match } = await loadIndex(indexUrl);
    const exact = exactPlace(places, q);
    if (exact) return { kind: "one", hit: exact };
    const found = match(q, Number.POSITIVE_INFINITY);
    if (found.clear && found.hits.length > 0)
      return { kind: "one", hit: found.hits[0] };
    hits = found.hits;
  } catch {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hits = (await res.json()) as SearchHit[];
  }
  return hits.length === 0 ? { kind: "none", q } : { kind: "many", q, hits };
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

/** The query as /szukaj reads it: trimmed, spaces folded, cut to length. */
const cleanQuery = (raw: string | null) =>
  (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);

/** The h1 for the outcome; nothing while one place opens. */
function ResultsHeading({ indexUrl, q }: { indexUrl: string; q: string }) {
  const result = use(outcome(indexUrl, q));
  if (result.kind === "one") return null;
  return <h1 className="govuk-heading-l">{H1[result.kind]}</h1>;
}

/** What was found, under the field; one clear place: straight to its page. */
function ResultsList({ indexUrl, q }: { indexUrl: string; q: string }) {
  const result = use(outcome(indexUrl, q));
  // Keeps the house number: "Asnyka 5" → /adres/…?nr=5.
  const target = result.kind === "one" ? placeHref(result.hit) : null;
  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);

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
  return null;
}

/**
 * The column: the field as soon as the page runs, holding the query (an
 * empty search: GOV.UK's error summary and message); the heading and the
 * results once the index has loaded, each behind a skeleton of itself.
 */
export function SearchResults({ indexUrl }: { indexUrl: string }) {
  use(browser("The results are matched over the index in the browser."));
  const q = cleanQuery(useSearchParams().get("q"));
  const root = useRef<HTMLDivElement>(null);

  // GOV.UK's error summary, rendered here after the page's own start of
  // GOV.UK Frontend (components/govuk-frontend.tsx): started on it, so it
  // takes focus, as on any page.
  useEffect(() => {
    if (q || !root.current) return;
    const scope = root.current;
    void import("@/lib/govuk-frontend").then((m) => m.initGovukFrontend(scope));
  }, [q]);

  return (
    <div className="govuk-grid-row" ref={root}>
      <div className="govuk-grid-column-two-thirds">
        {!q && <ErrorSummary error={EMPTY_ERROR} href="#adres" />}
        {q ? (
          <Suspense fallback={<HeadingSkeleton heading={H1.many} />}>
            <ResultsHeading indexUrl={indexUrl} q={q} />
          </Suspense>
        ) : (
          <h1 className="govuk-heading-l">{H1.empty}</h1>
        )}

        {/* GOV.UK search results: the heading, the field, then the results. */}
        <div className="govuk-!-margin-bottom-8">
          <AddressSearch
            indexUrl={indexUrl}
            value={q}
            error={q ? null : EMPTY_ERROR}
          />
        </div>

        {q && (
          <Suspense fallback={<ResultsSkeleton />}>
            <ResultsList indexUrl={indexUrl} q={q} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
