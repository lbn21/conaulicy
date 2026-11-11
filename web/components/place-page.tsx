import type { Metadata } from "next";
import { cacheLife, cacheTag, navigation } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Breadcrumbs, type Crumb, HOME_CRUMB } from "@/components/breadcrumbs";
import { ErrorSummary } from "@/components/error-summary";
import { NOT_FOUND_METADATA, PageNotFound } from "@/components/page-not-found";
import { PickupSchedule } from "@/components/pickup-schedule";
import {
  AiReadNote,
  CalendarBlock,
  SourceInset,
} from "@/components/subpage-parts";
import { houseQuery, withHouseNumber } from "@/lib/house";
import { indexable } from "@/lib/indexing";
import {
  localityAnchor,
  placePath,
  scheduleName,
  scheduleOwner,
  titleLabel,
} from "@/lib/places";
import { numberWarning } from "@/lib/prg";
import { getPlace, PLACE_TAGS, type PlaceView } from "@/lib/schedule";
import {
  hasUpcoming,
  laterNote,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  placeDescription,
  sharedNumberNote,
  shownNr,
  unverifiedNote,
} from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";
import {
  checkSchedule,
  noScheduleHeading,
  wasteChecked,
  wasteSources,
} from "@/lib/waste-module";

// The street or village page's parts: its metadata (the address page's,
// /adres/[id], components/hub.tsx), its heading, and its waste body, which
// the waste subpage (/adres/[id]/smieci) shows under breadcrumbs and the
// address page shows whole as its error (StreetPage). A house number is
// ?nr=, read from searchParams (numberQuery); an empty one, or one that is
// no house number, a split street answers with an error. Canonical is
// always /adres/[id].

/** An address route's searchParams (its PageProps'). */
export type AddressSearch = Promise<
  Record<string, string | string[] | undefined>
>;

/**
 * The page's ?nr= (lib/house.ts houseQuery), read per request after
 * navigation(), so an address route's App Shell and per-link prefetch stay
 * static output (ensureStatic 'prefetch', app/layout.tsx;
 * nextjs.org/docs/app/api-reference/functions/navigation). Asked after
 * knownPlace, so an unknown place's 404 is still decided first.
 */
export async function numberQuery(searchParams: AddressSearch) {
  await navigation();
  return houseQuery((await searchParams).nr);
}

/**
 * An address route's ?nr= for its generateMetadata, or null for an unknown
 * place: decided from params first (knownPlace, cached), before
 * searchParams is read, as the page does (HubMain, ModuleMain), so a 404's
 * metadata never waits on the query.
 */
export async function metadataQuery(id: string, searchParams: AddressSearch) {
  if (!(await knownPlace(id))) return null;
  return houseQuery((await searchParams).nr);
}

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
      <p className="govuk-body">{text}</p>
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
    return `Numeru ${place.unknownNr} nie ma w harmonogramie tej ulicy. Sprawdź numer albo harmonogram ${scheduleOwner(place.gmina)}`;
  }
  // A number the register lacks is no usable number either.
  return missing || place.invalidNr !== null
    ? "Wpisz numer domu, na przykład 12, 12a albo 7/22"
    : null;
}

/** The address page's metadata, cached as the page it describes. */
export async function placeMetadata(
  id: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const place = await getPlace(id, nr);
  // As app/not-found.tsx: Next.js's own noindex is the only robots tag.
  if (!place) return NOT_FOUND_METADATA;
  // GOV.UK: the title is the H1, and "Error: " first, so screen readers
  // hear it first. The place adds its locality, the H1 does not (Jakub's
  // decision, task 133: docs/layout.md).
  const name = withHouseNumber(titleLabel(place.label), shownNr(place));
  // With a house number, or an empty one, it describes the place itself.
  const whole = nr ? await getPlace(id, null) : place;
  return {
    ...pageMetadata({
      path: placePath(id),
      title: numberError(place, missing) ? `Błąd: ${name}` : name,
      description: placeDescription(whole ?? place),
    }),
    ...(!indexedPlace(place, missing) && {
      robots: { index: false, follow: indexable() },
    }),
  };
}

/**
 * The address page and the waste subpage may be search results, but not:
 * ?nr= without a usable number, an error of the street page, and a place
 * we have no dates for (its page only links the gmina's schedule; as
 * lib/places.ts hasZone, /ulice, the sitemap).
 */
export function indexedPlace(place: PlaceView, missing: boolean): boolean {
  return !(
    missing ||
    place.invalidNr !== null ||
    (place.zoneId === null && !place.askNumber)
  );
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

/**
 * Whether the place exists, cached as the address pages' metadata (the
 * place's tags). Asked before the page is read per request (task 239), so
 * an unknown place's 404 is decided in the cached part of the render,
 * before the shell is sent, and the answer is a real 404, not a 200.
 */
export async function knownPlace(id: string): Promise<boolean> {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  return (await getPlace(id, null)) !== null;
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
 * The address pages' frame (the hub, StreetPage, and every module's
 * subpage, components/module-page.tsx): the two-thirds column, GOV.UK's
 * error summary, the caption (a subpage's: its h1 does not name the place;
 * the address page's locality is in its breadcrumbs), the h1 (the place's
 * name by default), a house number the address register does not have
 * (numberWarning) or the street does not need (sharedNumberNote), „Zmień
 * adres”, then `children`, in the
 * layout's <main>. Its breadcrumbs are the layout's @breadcrumbs slot
 * (components/place-crumbs.tsx).
 */
export function AddressPage({
  place,
  caption,
  heading,
  error = null,
  children,
}: {
  place: PlaceView;
  caption?: string;
  heading?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const name = withHouseNumber(place.name, shownNr(place));
  const note = numberWarning(place) ?? sharedNumberNote(place);
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {error && <ErrorSummary error={error} href="#nr" />}
        {caption && <span className="govuk-caption-l">{caption}</span>}
        <h1 className="govuk-heading-l">{heading ?? name}</h1>
        {note && <p className="govuk-body">{note}</p>}
        {/* Like GOV.UK's "Change": back to the search on the home page. Spaced
          like the section breaks below (--l), so the first h2 never sits
          right under it. */}
        <p className="govuk-body govuk-!-margin-bottom-6">
          <Link href="/" className="govuk-link govuk-link--no-visited-state">
            Zmień adres<span className="govuk-visually-hidden"> {name}</span>
          </Link>
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Today's street page, whole: the address page's errors (?nr= without a
 * usable number, and a number no part of the street has) keep it, GOV.UK's
 * validation pattern with the question.
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
      <WasteBody data={place} error={error} />
    </AddressPage>
  );
}

/** "Lubaczów, ul. Adama Asnyka 12"; a village alone: "Basznia Dolna". */
export function placeCaption(place: PlaceView): string {
  const name = withHouseNumber(place.name, shownNr(place));
  return place.kind === "ulica" ? `${place.area}, ${name}` : name;
}

/**
 * The address pages' breadcrumbs (components/breadcrumbs.tsx): the home
 * page, the locality (its line on /ulice: a street's locality, a village
 * part's village; else the villages' list), and on a module's subpage the
 * address page. A village names its gmina there, as the caption did, not
 * itself again.
 */
export function PlaceBreadcrumbs({
  place,
  subpage = false,
}: {
  place: PlaceView;
  subpage?: boolean;
}) {
  const list = `${ALL_PLACES.path}#${
    place.group ? localityAnchor(place.group) : "wsie-heading"
  }`;
  const items: Crumb[] = [
    HOME_CRUMB,
    {
      href: list,
      label:
        place.kind === "ulica"
          ? place.area
          : place.area.charAt(0).toUpperCase() + place.area.slice(1),
    },
  ];
  if (subpage) {
    items.push({
      label: withHouseNumber(place.name, shownNr(place)),
      // The number as given, even where it changes nothing (the address
      // page then says so); none for an empty ?nr=.
      href: placePath(place.id, place.givenNr),
    });
  }
  return <Breadcrumbs items={items} />;
}

/**
 * The street page's dates, files and sources, or why there are none: the
 * waste module's subpage body (lib/modules.ts, /adres/<id>/smieci), and
 * StreetPage's.
 */
export function WasteBody({
  data: place,
  error,
}: {
  data: PlaceView;
  error: string | null;
}) {
  return (
    <>
      {place.askNumber ? (
        <HouseNumberQuestion place={place} error={error} />
      ) : place.zoneId === null ? (
        <NoDates
          id="empty-heading"
          heading={noScheduleHeading(place.kind)}
          text={checkSchedule(place)}
          place={place}
        />
      ) : !hasUpcoming(place.days, place.today) ? (
        // The schedule has ended and the next one is not in yet: no PDF
        // and no calendar file, as both would be empty.
        <NoDates
          id="ended-heading"
          heading={NO_MORE_DATES}
          text={`${NO_MORE_DATES_NEXT} ${checkSchedule(place, "Do tego czasu sprawdź")}`}
          place={place}
        />
      ) : (
        <>
          <CalendarBlock
            href={`/ics/${encodeURIComponent(place.zoneId)}`}
            label="Dodaj do kalendarza"
            hint="Plik z datami wywozu."
            event="calendar_add"
            zone={place.zoneId}
            source="street"
          />
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

          <PickupSchedule days={place.days} later={laterNote(place.days)} />

          {!place.verified && <AiReadNote text={unverifiedNote(place.gmina)} />}
        </>
      )}
      <SourceInset sources={wasteSources(place)} at={wasteChecked(place)} />
    </>
  );
}
