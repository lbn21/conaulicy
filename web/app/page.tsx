import { AddressSearch } from "@/components/address-search";
import { HOME_EXAMPLES } from "@/lib/examples";
import { examplePlaces, searchIndexUrl } from "@/lib/schedule";

export default async function Home() {
  // A few examples only: the full address list never ships to the client.
  const [places, indexUrl] = await Promise.all([
    examplePlaces(HOME_EXAMPLES),
    searchIndexUrl(),
  ]);

  // Variant A: a lookup page, as GOV.UK's "Find your local council": the
  // service in the heading, one line of context, the field, then what you get.
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Sprawdź dzień wywozu śmieci</h1>
        <p className="govuk-body-l">Dla Lubaczowa i wsi w gminie Lubaczów.</p>

        <div className="govuk-!-margin-bottom-8">
          <AddressSearch
            indexUrl={indexUrl}
            label="Ulica albo wieś"
            hint="Na przykład Asnyka 12 albo Lisie Jamy – polskie znaki nie są potrzebne"
          />
        </div>

        <h2 className="govuk-heading-m">Co zobaczysz</h2>
        <ul className="govuk-list govuk-list--bullet govuk-!-margin-bottom-8">
          <li>kiedy przyjedzie śmieciarka i co wystawić przed dom</li>
          <li>wszystkie terminy do dodania do kalendarza w telefonie</li>
          <li>harmonogram do wydrukowania (PDF)</li>
        </ul>

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
