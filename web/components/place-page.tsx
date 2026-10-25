import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ErrorSummary } from "@/components/error-summary";
import { NOT_FOUND_TITLE, PageNotFound } from "@/components/page-not-found";
import { PickupSchedule } from "@/components/pickup-schedule";
import { longDate } from "@/lib/date-labels";
import { withHouseNumber } from "@/lib/house";
import { indexable } from "@/lib/indexing";
import { localityAnchor, placePath, scheduleName } from "@/lib/places";
import { getPlace, movedTarget, type PlaceView } from "@/lib/schedule";
import {
  hasUpcoming,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  placeDescription,
  sharedNumberNote,
  UNVERIFIED_NOTE,
} from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";
import { noDataHeading } from "@/lib/waste-module";

// The street or village page's parts: its metadata (the address page's,
// /adres/[id], components/hub.tsx), its heading, and its waste body, which
// the waste subpage (/adres/[id]/smieci) shows under breadcrumbs and the
// address page's error variants show whole (StreetPage). With a house
// number, /adres/[id]?nr=… is rewritten in next.config.ts to
// /adres/[id]/nr/…, so it stays a cached page. Any other ?nr= (empty, or
// not a house number) goes to /adres/[id]/numer (proxy.ts), which a split
// street answers with an error. Canonical is always /adres/[id].

/**
 * A place without dates to show: why, then the gmina's own schedule (linked
 * when we know its page).
 */
function NoDates({
  id,
  heading,
  text,
  place,
}: {
  id: string;
  heading: string;
  text: string;
  place: PlaceView;
}) {
  return (
    <section aria-labelledby={id} className="govuk-inset-text">
      <h2 id={id} className="govuk-heading-m">
        {heading}
      </h2>
      <p className="govuk-body">
        {`${text} Do tego czasu sprawdź odbiory w harmonogramie gminy.`}
      </p>
      {place.schedulePage && (
        <p className="govuk-body">
          <a href={place.schedulePage} className="govuk-link">
            {`Otwórz ${scheduleName(place.gmina)}`}
          </a>
        </p>
      )}
    </section>
  );
}

/**
 * The house-number error on a split street (GOV.UK validation pattern), or
 * null: a number no part of the street has, or no usable number at all.
 */
export function numberError(place: PlaceView, missing: boolean): string | null {
  if (!place.askNumber) return null;
  if (place.unknownNr) {
    return `Numeru ${place.unknownNr} nie ma w harmonogramie tej ulicy. Sprawdź numer albo harmonogram gminy`;
  }
  return missing ? "Wpisz numer domu, na przykład 12, 12a albo 7/22" : null;
}

/**
 * A renamed place's old address (place_redirects): 308 to the same page on
 * its new id. `path` is the address as the visitor asked for it. Thrown
 * before the page streams, so the status is a real 308. Only for pages
 * reached without a rewrite: proxy.ts answers the ?nr= addresses.
 */
export async function redirectIfMoved(id: string, path: string) {
  if (await getPlace(id, null)) return;
  const target = await movedTarget(id, path);
  if (target) permanentRedirect(target);
}

export async function placeMetadata(
  id: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  return addressMetadata(id, nr, missing, "address");
}

/**
 * The waste subpage's (/adres/<id>/smieci): its own canonical, title
 * "Odbiór śmieci: wszystkie terminy – <place>" and description.
 */
export async function wasteMetadata(
  id: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  return addressMetadata(id, nr, missing, "waste");
}

async function addressMetadata(
  id: string,
  nr: string | null,
  missing: boolean,
  page: "address" | "waste",
): Promise<Metadata> {
  const place = await getPlace(id, nr);
  // As app/not-found.tsx: Next.js's own noindex is the only robots tag.
  if (!place) return { title: NOT_FOUND_TITLE, robots: null };
  // GOV.UK: the title is the H1 (the waste subpage's, then its place), and
  // "Error: " first, so screen readers hear it first.
  const name = withHouseNumber(place.name, place.nr);
  const h1 =
    page === "waste" ? `${WASTE_H1}: wszystkie terminy – ${name}` : name;
  const title = numberError(place, missing) ? `Błąd: ${h1}` : h1;
  // The house-number and /numer variants describe the place itself.
  const whole = nr ? await getPlace(id, null) : place;
  return {
    ...pageMetadata({
      path: page === "waste" ? `${placePath(id)}/smieci` : placePath(id),
      title,
      description: placeDescription(whole ?? place, page),
    }),
    // Never a search result, its links still followed once the site is
    // indexable: /numer, an error variant of the street page, and a place
    // we have no dates for (its page only links the gmina's schedule).
    ...((missing || noData(place)) && {
      robots: { index: false, follow: indexable() },
    }),
  };
}

/** No pickup data at all, as lib/places.ts hasZone (/ulice, the sitemap). */
function noData(place: PlaceView): boolean {
  return place.zoneId === null && !place.askNumber;
}

/**
 * Throws notFound() inside a Suspense boundary whose fallback is the 404
 * page. Thrown outside one, Next.js 16 sends an empty error shell (no
 * layout, no text) and draws the page only with JS; here the server HTML has
 * the full page, and Next.js still answers 404 (it sets the status when an
 * error ends a boundary). With JS, Next.js renders app/not-found.tsx, the
 * same content.
 */
function NotFound(): never {
  notFound();
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
    <form method="get" action={placePath(place.id)} noValidate>
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

/** The 404 page for an unknown place or module (see NotFound). */
export function PlaceNotFound() {
  return (
    <Suspense fallback={<PageNotFound />}>
      <NotFound />
    </Suspense>
  );
}

/**
 * The top of the street page, the address page and the waste subpage:
 * GOV.UK's error summary, the caption (the subpage's: its h1 does not name
 * the place; the address page's locality is in its breadcrumbs), the h1, a house number the street
 * does not need (sharedNumberNote), then „Zmień adres”.
 */
function PlaceHeading({
  place,
  caption,
  heading,
  error = null,
}: {
  place: PlaceView;
  caption?: string;
  heading: string;
  error?: string | null;
}) {
  const name = withHouseNumber(place.name, place.nr);
  const note = sharedNumberNote(place);
  return (
    <>
      {error && <ErrorSummary error={error} href="#nr" />}
      {caption && <span className="govuk-caption-l">{caption}</span>}
      <h1 className="govuk-heading-l">{heading}</h1>
      {note && <p className="govuk-body">{note}</p>}
      {/* Like GOV.UK's "Change": back to the search on the home page. */}
      <p className="govuk-body">
        <a href="/" className="govuk-link govuk-link--no-visited-state">
          Zmień adres<span className="govuk-visually-hidden"> {name}</span>
        </a>
      </p>
    </>
  );
}

/**
 * Today's street page, whole: the address page's error variants (/numer,
 * and a number no part of the street has) keep it, GOV.UK's validation
 * pattern with the question.
 */
export function StreetPage({
  place,
  missing = false,
}: {
  place: PlaceView;
  missing?: boolean;
}) {
  const error = numberError(place, missing);
  return (
    <AddressPage place={place} error={error}>
      <WasteBody place={place} error={error} />
    </AddressPage>
  );
}

/**
 * The address page's frame (the hub, and StreetPage): its breadcrumbs, then
 * the two-thirds column with its heading, the place's name as the h1.
 */
export function AddressPage({
  place,
  error = null,
  children,
}: {
  place: PlaceView;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <Breadcrumbs place={place} />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <PlaceHeading
            place={place}
            heading={withHouseNumber(place.name, place.nr)}
            error={error}
          />
          {children}
        </div>
      </div>
    </>
  );
}

/** "Lubaczów, ul. Adama Asnyka 12"; a village alone: "Basznia Dolna". */
function placeCaption(place: PlaceView): string {
  const name = withHouseNumber(place.name, place.nr);
  return place.kind === "ulica" ? `${place.area}, ${name}` : name;
}

/**
 * GOV.UK's breadcrumbs, every item a link and the page itself left out: the
 * home page, the locality (its group on /ulice: a street's locality, a
 * village part's village with streets; else the villages' list), and on a
 * module's subpage the address page. A village names
 * its gmina there, as the caption did, not itself again.
 * Inside <main> (the layout's), so its own margin-top gives way to main's
 * padding, and its margin-bottom adds main's: GOV.UK's 30/50 px to what
 * follows.
 */
export function Breadcrumbs({
  place,
  subpage = false,
}: {
  place: PlaceView;
  subpage?: boolean;
}) {
  const list = `${ALL_PLACES.path}#${
    place.group ? localityAnchor(place.group) : "wsie-heading"
  }`;
  const items: Array<[string, string]> = [
    ["Strona główna", "/"],
    place.kind === "ulica"
      ? [place.area, list]
      : [place.area.charAt(0).toUpperCase() + place.area.slice(1), list],
  ];
  if (subpage) {
    items.push([
      withHouseNumber(place.name, place.nr),
      // The number as given, even where it changes nothing (the address
      // page then says so); none on /numer.
      placePath(place.id, place.givenNr),
    ]);
  }
  return (
    <nav
      className="govuk-breadcrumbs govuk-!-margin-top-0 govuk-!-margin-bottom-8"
      aria-label="Ścieżka nawigacyjna"
    >
      <ol className="govuk-breadcrumbs__list">
        {items.map(([text, href]) => (
          <li key={href} className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href={href}>
              {text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The waste module's subpage body (lib/modules.ts, /adres/<id>/smieci,
 * under ModuleMain's breadcrumbs): today's street page, the h1 „Odbiór
 * śmieci”.
 */
export function WasteDetails({
  data: place,
  missing = false,
}: {
  data: PlaceView;
  missing?: boolean;
}) {
  const error = numberError(place, missing);
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <PlaceHeading
          place={place}
          caption={placeCaption(place)}
          heading={WASTE_H1}
          error={error}
        />
        <WasteBody place={place} error={error} />
      </div>
    </div>
  );
}

/** The waste subpage's h1. */
const WASTE_H1 = "Odbiór śmieci";

/** The street page's dates, files and sources, or why there are none. */
function WasteBody({
  place,
  error,
}: {
  place: PlaceView;
  error: string | null;
}) {
  return (
    <>
      {place.askNumber ? (
        <HouseNumberQuestion place={place} error={error} />
      ) : place.zoneId === null ? (
        <NoDates
          id="empty-heading"
          heading={noDataHeading(place.kind)}
          text="Harmonogramu tu nie zgadujemy."
          place={place}
        />
      ) : !hasUpcoming(place.days, place.today) ? (
        // The schedule has ended and the next one is not in yet: no PDF
        // and no calendar file, as both would be empty.
        <NoDates
          id="ended-heading"
          heading={NO_MORE_DATES}
          text={NO_MORE_DATES_NEXT}
          place={place}
        />
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
              href={`${placePath(place.id)}/harmonogram.pdf${place.nr ? `?nr=${place.nr}` : ""}`}
              data-event="pdf_open"
              data-zone={place.zoneId}
              className="govuk-link"
            >
              Harmonogram do druku (PDF)
            </a>
          </p>

          <PickupSchedule days={place.days} renderedOn={place.today} />

          {!place.verified && (
            <div className="govuk-warning-text">
              <span className="govuk-warning-text__icon" aria-hidden="true">
                !
              </span>
              <strong className="govuk-warning-text__text">
                <span className="govuk-visually-hidden">Uwaga</span>
                {UNVERIFIED_NOTE}
              </strong>
            </div>
          )}
          <div className="govuk-inset-text">
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
    </>
  );
}
