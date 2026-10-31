import { LOADING, Skeleton } from "@/components/skeleton";
import { HINT, LABEL } from "@/lib/search-hint";

/**
 * /szukaj while its results load (app/szukaj/page.tsx, the Suspense
 * fallback): the results page's column as grey bars, in its elements and
 * GOV.UK classes, so each takes the place the real one will: the h1, the
 * field's label, hint, field and „Szukaj”, then about one typical result
 * (the line above the list and one address). Fewer or more results move
 * what follows a little when they arrive (accepted, Jakub, 31 Oct 2026).
 */
export function SearchSkeleton({ heading }: { heading: string }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <p className="govuk-visually-hidden">{LOADING}</p>
        <div aria-hidden="true">
          <p className="govuk-heading-l">
            <Skeleton>{heading}</Skeleton>
          </p>
          <div className="govuk-!-margin-bottom-8">
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
            <div className="govuk-button app-skeleton">Szukaj</div>
          </div>
          <p className="govuk-body">
            <Skeleton>Dla „…” znaleźliśmy 1 adres. Wybierz swój.</Skeleton>
          </p>
          <ul className="govuk-list">
            <li>
              <Skeleton>ul. Adama Mickiewicza, Lubaczów</Skeleton>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
