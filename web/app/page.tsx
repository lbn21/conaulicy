import { AddressSearch } from "@/components/address-search";
import { listPlaces } from "@/lib/schedule";

const EXAMPLE_COUNT = 5;

export default function Home() {
  // A few examples only: the full address list never ships to the client.
  const places = listPlaces().slice(0, EXAMPLE_COUNT);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Kiedy śmieciarka przyjedzie pod Twój dom?
      </h1>
      <p className="mt-4 max-w-prose">
        Wpisz ulicę w Lubaczowie albo wieś w gminie. Pokażemy, co wystawić przed
        dom i na kiedy.
      </p>

      <div className="mt-8">
        <AddressSearch />
      </div>

      <section aria-labelledby="sample-heading" className="mt-12">
        <h2 id="sample-heading" className="text-lg font-bold">
          Adresy w tej próbce
        </h2>
        <p className="mt-2 max-w-prose text-text-muted">
          Kilka prawdziwych miejsc, nie cały Lubaczów. Resztę dopisujemy.
        </p>
        <ul className="mt-4 border-t border-border">
          {places.map((place) => (
            <li key={place.id} className="border-b border-border">
              <a
                href={`/adres/${place.id}`}
                className="flex min-h-12 items-center py-2 underline decoration-2 underline-offset-4"
              >
                {place.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
