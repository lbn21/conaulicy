import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { ImgwLive } from "@/components/imgw-banner";
import { PlaceLink } from "@/components/place-link";
import { DATASET } from "@/lib/headers";
import { type ListedPlace, localityAnchor, placePath } from "@/lib/places";
import { searchIndex } from "@/lib/schedule";
import { pageMetadata } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";

export const metadata: Metadata = pageMetadata({
  path: ALL_PLACES.path,
  title: ALL_PLACES.text,
  description:
    "Wszystkie ulice Lubaczowa i wsie gminy Lubaczów w jednym miejscu. Wybierz swoją i sprawdź wywóz śmieci, przerwy w dostawie wody i ostrzeżenia IMGW.",
});

/**
 * Every place search can find, as plain links: for people who would rather
 * browse, without JS, and for search engines. The town's streets by first
 * letter (Polish order), then the villages, each a link, with their streets
 * under it if they have any. Its only client JS is PlaceLink's prefetch on
 * intent (components/place-link.tsx); the links work without it.
 */
export default function AllPlacesPage() {
  return (
    <>
      <ImgwLive />
      <AllPlaces />
    </>
  );
}

// The page's static shell but the IMGW banner (its own hole): from the
// cached search index, as the sitemap, the same places, cached until the
// next import (tag `dataset`, POST /api/revalidate) or deploy.
async function AllPlaces() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  const { list, noData } = await searchIndex();
  const without = new Set(noData);
  const town = list.townId ? localityAnchor(list.townId) : undefined;
  // A place we have no dates for says so (its page links the gmina's
  // schedule).
  const Place = ({ place }: { place: ListedPlace }) => (
    <>
      <PlaceLink href={placePath(place.id)}>{place.label}</PlaceLink>
      {without.has(place.id) && " (brak danych)"}
    </>
  );

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">{ALL_PLACES.text}</h1>
        <p className="govuk-body-l">
          Wybierz swoją ulicę albo wieś, żeby zobaczyć terminy wywozu śmieci,
          przerwy w dostawie wody i ostrzeżenia IMGW.
        </p>
        <p className="govuk-body govuk-!-margin-bottom-8">
          Wolisz wpisać adres?{" "}
          <Link href="/" className="govuk-link">
            Wyszukaj go na stronie głównej
          </Link>
          .
        </p>

        {/* Ids from SIMC (localityAnchor) on the town's heading and every
              village's line, where the breadcrumbs link; the section keeps
              the old #ulice-heading, at the same spot. */}
        <section id="ulice-heading" aria-labelledby={town}>
          <h2 id={town} className="govuk-heading-m">
            Ulice w Lubaczowie
          </h2>
          {list.town.map(({ letter, places }) => (
            <div key={letter}>
              <h3 className="govuk-heading-s">{letter}</h3>
              <ul className="govuk-list">
                {places.map((place) => (
                  <li key={place.id}>
                    <Place place={place} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="wsie-heading">
          <h2
            id="wsie-heading"
            className="govuk-heading-m govuk-!-margin-top-6"
          >
            Wsie w gminie Lubaczów
          </h2>
          <ul className="govuk-list">
            {list.villages.map((village) => (
              <li key={village.id} id={localityAnchor(village.id)}>
                <Place place={village} />
                {village.streets.length > 0 && (
                  <ul className="govuk-list govuk-!-margin-left-4 govuk-!-margin-top-1">
                    {village.streets.map((street) => (
                      <li key={street.id}>
                        <Place place={street} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
