import { LOADING, Skeleton } from "@/components/skeleton";

// /szukaj's results placeholder (app/szukaj/page.tsx,
// components/search-results.tsx), as grey bars in the elements and GOV.UK
// classes of what they stand for, so it takes the place the real ones will.
// Only the results: the heading and the field are in the page's static
// shell. Fewer or more results move what follows a little when they arrive
// (accepted, Jakub, 31 Oct 2026).

/** About one typical result, with one „Sprawdzamy…” for screen readers. */
export function ResultsSkeleton() {
  return (
    <div>
      <p className="govuk-visually-hidden">{LOADING}</p>
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
    </div>
  );
}
