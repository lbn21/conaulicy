import { blank, LOADING, Skeleton } from "@/components/skeleton";
import { HINT, LABEL } from "@/lib/search-hint";

// /szukaj's placeholders (app/szukaj/page.tsx, components/search-results.tsx),
// as grey bars in the elements and GOV.UK classes of what they stand for, so
// each takes the place the real one will. Fewer or more results move what
// follows a little when they arrive (accepted, Jakub, 31 Oct 2026).

/** The h1, while the results load. */
export function HeadingSkeleton({ heading }: { heading: string }) {
  return (
    <p className="govuk-heading-l" aria-hidden="true">
      <Skeleton>{heading}</Skeleton>
    </p>
  );
}

/** About one typical result: the line above the list and one address. */
function ResultBars() {
  return (
    <div aria-hidden="true">
      <p className="govuk-body">
        <Skeleton>Dla „…” znaleźliśmy 1 adres. Wybierz swój.</Skeleton>
      </p>
      <ul className="govuk-list">
        <li>
          <Skeleton>ul. Adama Mickiewicza, Lubaczów</Skeleton>
        </li>
      </ul>
    </div>
  );
}

/** The results, while they load, with one „Sprawdzamy…” for screen readers. */
export function ResultsSkeleton() {
  return (
    <div>
      <p className="govuk-visually-hidden">{LOADING}</p>
      <ResultBars />
    </div>
  );
}

/**
 * The whole column, until the page's script runs (the Suspense fallback in
 * the HTML): the h1, the field's label, hint, field and „Szukaj”, then
 * about one typical result.
 */
export function SearchSkeleton({ heading }: { heading: string }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <p className="govuk-visually-hidden">{LOADING}</p>
        <HeadingSkeleton heading={heading} />
        <div className="govuk-!-margin-bottom-8" aria-hidden="true">
          <div className="govuk-form-group">
            {/* A div, as a <p> keeps the browser's top margin, which
                govuk-label (made for <label>) does not reset. */}
            <div className="govuk-label govuk-label--m">
              <Skeleton>{LABEL}</Skeleton>
            </div>
            <div className="govuk-hint">
              <Skeleton>{HINT}</Skeleton>
            </div>
            <div className="govuk-input app-skeleton" />
          </div>
          <div className="govuk-button app-skeleton">{blank("Szukaj")}</div>
        </div>
        <ResultBars />
      </div>
    </div>
  );
}
