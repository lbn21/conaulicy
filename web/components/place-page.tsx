import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/link-button";
import { PickupSchedule } from "@/components/pickup-schedule";
import { longDate } from "@/lib/date-labels";
import { withHouseNumber } from "@/lib/house";
import { scheduleName } from "@/lib/places";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { SEARCH_ID } from "@/lib/search";

// The street or village page, for /adres/[id] and, with a house number,
// /adres/[id]?nr=… (rewritten in next.config.ts to /adres/[id]/nr/…, so it
// stays a cached page). Canonical is always /adres/[id].

export async function placeMetadata(
  id: string,
  nr: string | null,
): Promise<Metadata> {
  const place = await getPlace(id, nr);
  return {
    title: place ? withHouseNumber(place.label, place.nr) : "Adres",
    alternates: { canonical: `/adres/${encodeURIComponent(id)}` },
  };
}

/**
 * A street split by house numbers: ask for the number, like a GOV.UK
 * question page. A plain GET form, so it works without JS.
 */
function HouseNumberQuestion({ place }: { place: PlaceView }) {
  return (
    <form method="get" action={`/adres/${encodeURIComponent(place.id)}`}>
      <div className="govuk-form-group">
        <label htmlFor="nr" className="govuk-label govuk-label--m">
          Jaki jest numer domu?
        </label>
        <div id="nr-hint" className="govuk-hint">
          Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru. Na
          przykład 12, 12a albo 7/22.
        </div>
        {place.unknownNr && (
          <p id="nr-note" className="govuk-body govuk-!-font-weight-bold">
            Numeru {place.unknownNr} nie ma w harmonogramie tej ulicy. Sprawdź
            numer albo harmonogram gminy.
          </p>
        )}
        <input
          id="nr"
          name="nr"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={12}
          aria-describedby={place.unknownNr ? "nr-hint nr-note" : "nr-hint"}
          className="govuk-input govuk-input--width-5"
        />
      </div>
      <button type="submit" className="govuk-button">
        Pokaż odbiory
      </button>
    </form>
  );
}

export async function PlaceMain({ id, nr }: { id: string; nr: string | null }) {
  const place = await getPlace(id, nr);
  if (!place) notFound();
  const name = withHouseNumber(place.name, place.nr);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <span className="govuk-caption-l">{place.area}</span>
        <h1 className="govuk-heading-l">{name}</h1>
        {/* Like GOV.UK's "Change": back to an empty, focused search. */}
        <p className="govuk-body">
          <a
            href={`/#${SEARCH_ID}`}
            className="govuk-link govuk-link--no-visited-state"
          >
            Zmień adres<span className="govuk-visually-hidden"> {name}</span>
          </a>
        </p>

        {place.askNumber ? (
          <HouseNumberQuestion place={place} />
        ) : place.zoneId === null ? (
          <section
            aria-labelledby="empty-heading"
            className="mt-8 border-l-4 border-accent pl-4"
          >
            <h2 id="empty-heading" className="govuk-heading-m">
              {place.kind === "ulica"
                ? "Tej ulicy jeszcze nie mamy"
                : "Tej wsi jeszcze nie mamy"}
            </h2>
            <p className="govuk-body">
              Harmonogramu tu nie zgadujemy. Do tego czasu sprawdź odbiory w
              harmonogramie gminy.
            </p>
            {place.schedulePage && (
              <p className="govuk-body">
                <a href={place.schedulePage} className="govuk-link">
                  {`Otwórz ${scheduleName(place.gmina)}`}
                </a>
              </p>
            )}
          </section>
        ) : (
          <>
            <LinkButton
              href={`/ics/${encodeURIComponent(place.zoneId)}`}
              data-event="calendar_add"
              data-zone={place.zoneId}
              data-source="street"
            >
              Dodaj do kalendarza
            </LinkButton>
            <p className="govuk-body">
              Plik z datami. Telefon zapyta, czy wpisać je do kalendarza.
            </p>
            <p className="govuk-body">
              <a
                href={`/adres/${encodeURIComponent(place.id)}/harmonogram.pdf${place.nr ? `?nr=${place.nr}` : ""}`}
                data-event="pdf_open"
                data-zone={place.zoneId}
                className="govuk-link"
              >
                Harmonogram do druku (PDF)
              </a>
            </p>

            <PickupSchedule days={place.days} renderedOn={place.today} />

            <div className="border-t border-border pt-6">
              {!place.verified && (
                <p className="govuk-body">
                  Te daty odczytaliśmy automatycznie z harmonogramu gminy i nikt
                  ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie
                  zgadzało, rację ma harmonogram gminy.
                </p>
              )}
              {place.sources.map((source) => (
                <p key={source.label} className="govuk-body">
                  Źródło:{" "}
                  {source.url ? (
                    <a href={source.url} className="govuk-link">
                      {scheduleName(place.gmina)}
                    </a>
                  ) : (
                    scheduleName(place.gmina)
                  )}
                  , {source.label}
                  {source.checkedAt && (
                    <>. Stan na {longDate(source.checkedAt)}.</>
                  )}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
