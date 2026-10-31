import { LOADING, Skeleton } from "@/components/skeleton";

// What „Szukaj” shows under the field while the search index is still
// loading (components/address-search.tsx): one typical result, as grey bars
// in the elements and GOV.UK classes of what they stand for (the heading,
// the line above the list, one address), so it takes a fixed place, about
// the one results will. More results move what follows a little when they
// arrive (accepted, Jakub, 31 Oct 2026).

/** About one typical result, with one „Sprawdzamy…” for screen readers. */
export function ResultsSkeleton() {
  return (
    <div>
      <p className="govuk-visually-hidden">{LOADING}</p>
      <div aria-hidden="true">
        <p className="govuk-heading-m">
          <Skeleton>Wyniki wyszukiwania</Skeleton>
        </p>
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
