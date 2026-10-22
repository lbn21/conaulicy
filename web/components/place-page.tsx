import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickupSchedule } from "@/components/pickup-schedule";
import { longDate } from "@/lib/date-labels";
import { withHouseNumber } from "@/lib/house";
import { scheduleName } from "@/lib/places";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { hasUpcoming, UNVERIFIED_NOTE } from "@/lib/schedule-notes";

// The street or village page, for /adres/[id] and, with a house number,
// /adres/[id]?nr=… (rewritten in next.config.ts to /adres/[id]/nr/…, so it
// stays a cached page). Any other ?nr= (empty, or not a house number) goes to
// /adres/[id]/numer (proxy.ts), which a split street answers with an error.
// Canonical is always /adres/[id].

/**
 * The house-number error on a split street (GOV.UK validation pattern), or
 * null: a number no part of the street has, or no usable number at all.
 */
function numberError(place: PlaceView, missing: boolean): string | null {
  if (!place.askNumber) return null;
  if (place.unknownNr) {
    return `Numeru ${place.unknownNr} nie ma w harmonogramie tej ulicy. Sprawdź numer albo harmonogram gminy`;
  }
  return missing ? "Wpisz numer domu, na przykład 12, 12a albo 7/22" : null;
}

export async function placeMetadata(
  id: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  const place = await getPlace(id, nr);
  const title = place ? withHouseNumber(place.label, place.nr) : "Adres";
  return {
    // GOV.UK: "Error: " first in the title, so screen readers hear it first.
    title: place && numberError(place, missing) ? `Błąd: ${title}` : title,
    alternates: { canonical: `/adres/${encodeURIComponent(id)}` },
  };
}

/** GOV.UK's error summary, focused on load by its JS (lib/govuk-frontend). */
function ErrorSummary({ error }: { error: string }) {
  return (
    <div className="govuk-error-summary" data-module="govuk-error-summary">
      <div role="alert">
        <h2 className="govuk-error-summary__title">Jest problem</h2>
        <div className="govuk-error-summary__body">
          <ul className="govuk-list govuk-error-summary__list">
            <li>
              <a href="#nr">{error}</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * A street split by house numbers: ask for the number, like a GOV.UK
 * question page. A plain GET form, so it works without JS.
 */
function HouseNumberQuestion({
  place,
  error,
}: {
  place: PlaceView;
  error: string | null;
}) {
  return (
    <form
      method="get"
      action={`/adres/${encodeURIComponent(place.id)}`}
      noValidate
    >
      <div
        className={
          error
            ? "govuk-form-group govuk-form-group--error"
            : "govuk-form-group"
        }
      >
        <label htmlFor="nr" className="govuk-label govuk-label--m">
          Jaki jest numer domu?
        </label>
        <div id="nr-hint" className="govuk-hint">
          Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru. Na
          przykład 12, 12a albo 7/22.
        </div>
        {error && (
          <p id="nr-error" className="govuk-error-message">
            <span className="govuk-visually-hidden">Błąd:</span> {error}
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
          aria-describedby={error ? "nr-hint nr-error" : "nr-hint"}
          className={
            error
              ? "govuk-input govuk-input--width-5 govuk-input--error"
              : "govuk-input govuk-input--width-5"
          }
        />
      </div>
      <button type="submit" className="govuk-button" data-module="govuk-button">
        Pokaż odbiory
      </button>
    </form>
  );
}

export async function PlaceMain({
  id,
  nr,
  missing = false,
}: {
  id: string;
  nr: string | null;
  /** ?nr= was sent without a usable number (/adres/[id]/numer). */
  missing?: boolean;
}) {
  const place = await getPlace(id, nr);
  if (!place) notFound();
  const name = withHouseNumber(place.name, place.nr);
  const error = numberError(place, missing);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {error && <ErrorSummary error={error} />}
        <span className="govuk-caption-l">{place.area}</span>
        <h1 className="govuk-heading-l">{name}</h1>
        {/* Like GOV.UK's "Change": back to the search on the home page. */}
        <p className="govuk-body">
          <a href="/" className="govuk-link govuk-link--no-visited-state">
            Zmień adres<span className="govuk-visually-hidden"> {name}</span>
          </a>
        </p>

        {place.askNumber ? (
          <HouseNumberQuestion place={place} error={error} />
        ) : place.zoneId === null ? (
          <section aria-labelledby="empty-heading" className="govuk-inset-text">
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
        ) : !hasUpcoming(place.days, place.today) ? (
          // The schedule has ended and the next one is not in yet: no PDF
          // and no calendar file, as both would be empty.
          <section aria-labelledby="ended-heading" className="govuk-inset-text">
            <h2 id="ended-heading" className="govuk-heading-m">
              Kolejnych terminów jeszcze nie mamy
            </h2>
            <p className="govuk-body">
              Dodamy je, gdy tylko gmina ogłosi nowy harmonogram. Do tego czasu
              sprawdź odbiory w harmonogramie gminy.
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
            {/* GOV.UK's link button: a link that looks and works like a
                button; GOV.UK's Button JS makes Space activate it. */}
            {/* biome-ignore lint/a11y/useSemanticElements: it navigates to a file, so it stays a link, as GOV.UK documents */}
            <a
              href={`/ics/${encodeURIComponent(place.zoneId)}`}
              role="button"
              draggable="false"
              className="govuk-button"
              data-module="govuk-button"
              data-event="calendar_add"
              data-zone={place.zoneId}
              data-source="street"
            >
              Dodaj do kalendarza
            </a>
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

            <div className="govuk-inset-text">
              {!place.verified && (
                <p className="govuk-body">{UNVERIFIED_NOTE}</p>
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
