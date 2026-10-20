import { AddressSearch } from "@/components/address-search";
import { HOME_EXAMPLES } from "@/lib/examples";
import { examplePlaces, searchIndexUrl } from "@/lib/schedule";

export default async function Home() {
  // A few examples only: the full address list never ships to the client.
  const [places, indexUrl] = await Promise.all([
    examplePlaces(HOME_EXAMPLES),
    searchIndexUrl(),
  ]);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">
          Kiedy śmieciarka przyjedzie pod Twój dom?
        </h1>
        <p className="govuk-body-l">
          Wpisz ulicę w Lubaczowie albo wieś w gminie. Pokażemy, co wystawić
          przed dom i na kiedy.
        </p>

        <div className="govuk-!-margin-bottom-8">
          <AddressSearch indexUrl={indexUrl} />
        </div>

        <section aria-labelledby="sample-heading">
          <h2 id="sample-heading" className="govuk-heading-m">
            Przykładowe adresy
          </h2>
          <p className="govuk-body">
            Na razie znamy tylko część ulic i wsi. Kolejne dopisujemy.
          </p>
          <ul className="govuk-list">
            {places.map((place) => (
              <li key={place.id}>
                <a href={`/adres/${place.id}`} className="govuk-link">
                  {place.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
