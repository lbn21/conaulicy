import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { AddressSearch } from "@/components/address-search";
import { ErrorSummary } from "@/components/error-summary";
import { ImgwBanner } from "@/components/imgw-banner";
import { withHouseNumber } from "@/lib/house";
import { indexable } from "@/lib/indexing";
import { searchIndex, searchIndexUrl, searchMatcher } from "@/lib/schedule";
import {
  addresses,
  exactPlace,
  MAX_QUERY_LENGTH,
  placeHref,
  type SearchHit,
} from "@/lib/search";
import { pageMetadata } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";

// The home page's search form, with or without JS, and above the results
// the same field (components/address-search.tsx), filled with what was
// searched for. A picked suggestion's text (the field's value after a pick)
// opens its place; anything else gets the same ranked search as the search
// field (lib/search.ts, over the cached index), every result instead of 8.
// One clearly best place: straight to its page; otherwise the ranked list;
// none: what to try next. Rendered per request, so never cached by the CDN;
// never indexed (next.config.ts sends the header).

const EMPTY_ERROR = "Wpisz nazwę ulicy albo wsi";

type Outcome =
  | { kind: "empty" }
  | { kind: "none"; q: string }
  | { kind: "one"; hit: SearchHit }
  | { kind: "many"; q: string; hits: SearchHit[] };

async function outcome(
  searchParams: PageProps<"/szukaj">["searchParams"],
): Promise<Outcome> {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH);
  if (!q) return { kind: "empty" };
  const { places } = await searchIndex();
  const exact = exactPlace(places, q);
  if (exact) return { kind: "one", hit: exact };
  const { hits, clear } = (await searchMatcher())(q, Number.POSITIVE_INFINITY);
  if (hits.length === 0) return { kind: "none", q };
  if (clear) return { kind: "one", hit: hits[0] };
  return { kind: "many", q, hits };
}

const H1 = {
  empty: "Wyszukaj adres",
  none: "Brak wyników",
  many: "Wyniki wyszukiwania",
} as const;

export async function generateMetadata({
  searchParams,
}: PageProps<"/szukaj">): Promise<Metadata> {
  const result = await outcome(searchParams);
  const h1 = result.kind === "one" ? H1.many : H1[result.kind];
  // GOV.UK: "Error: " first in the title, so screen readers hear it first.
  const title = result.kind === "empty" ? `Błąd: ${h1}` : h1;
  return {
    ...pageMetadata({
      path: "/szukaj",
      title,
      description: "Wyniki wyszukiwania ulicy albo wsi w gminie Lubaczów.",
    }),
    robots: { index: false, follow: indexable() },
  };
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/szukaj">) {
  const result = await outcome(searchParams);
  // Keeps the house number: "Asnyka 12" → /adres/…?nr=12. Next.js
  // redirects from a page with 307 or 308 only; 308, as the brief allows.
  if (result.kind === "one") permanentRedirect(placeHref(result.hit));

  return (
    <>
      <ImgwBanner />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {result.kind === "empty" && (
            <ErrorSummary error={EMPTY_ERROR} href="#adres" />
          )}
          <h1 className="govuk-heading-l">{H1[result.kind]}</h1>

          {/* GOV.UK search results: the heading, the field, then the results. */}
          <div className="govuk-!-margin-bottom-8">
            <AddressSearch
              indexUrl={await searchIndexUrl()}
              value={result.kind === "empty" ? "" : result.q}
              error={result.kind === "empty" ? EMPTY_ERROR : null}
            />
          </div>

          {result.kind === "many" && (
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
          )}

          {result.kind === "none" && (
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
          )}
        </div>
      </div>
    </>
  );
}
