import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb, HOME_CRUMB } from "@/components/breadcrumbs";
import type { IconName } from "@/components/icon";
import { PageHead } from "@/components/page-head";
import { PickupSchedule } from "@/components/pickup-schedule";
import {
  AiReadNote,
  CalendarBlock,
  SourceInset,
} from "@/components/subpage-parts";
import { indexable } from "@/lib/indexing";
import {
  localityAnchor,
  placePath,
  scheduleName,
  titleLabel,
} from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";
import {
  hasUpcoming,
  laterNote,
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  placeDescription,
  unverifiedNote,
} from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";
import {
  checkSchedule,
  noScheduleHeading,
  wasteCalendarRefresh,
  wasteSources,
} from "@/lib/waste-module";

// The street or village page's parts: its metadata (the address page's,
// /adres/[id], components/hub.tsx), its frame and heading, and its waste
// body, which the waste subpage (/adres/[id]/smieci) shows under its
// heading. Canonical is always the page's own path.

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
    <section aria-labelledby={id} className="app-empty">
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

/** The address page's metadata, from the place it describes. */
export function placeMetadata(place: PlaceView): Metadata {
  // GOV.UK: the title is the H1. The place adds its locality, the H1 does
  // not (docs/layout.md).
  return {
    ...pageMetadata({
      path: placePath(place.id),
      title: titleLabel(place.label),
      description: placeDescription(place),
    }),
    ...(!indexedPlace(place) && {
      robots: { index: false, follow: indexable() },
    }),
  };
}

/**
 * The address page and the waste subpage may be search results, but not a
 * place we have no dates for (its page only links the gmina's schedule; as
 * lib/places.ts hasZone, /ulice, the sitemap).
 */
export function indexedPlace(place: PlaceView): boolean {
  return place.zoneId !== null;
}

/**
 * The address pages' frame (the hub and every module's subpage,
 * components/module-page.tsx): the two-thirds column, the caption (a
 * subpage's: its h1 does not name the place; the address page's locality
 * is in its breadcrumbs), the h1 (the place's name by default), „Zmień
 * adres”, then `children`, in the layout's <main>. Its breadcrumbs are the
 * band's first line (PlaceBreadcrumbs; a subpage's, with a caption, end at
 * the address page).
 */
export function AddressPage({
  place,
  caption,
  heading,
  icon,
  children,
}: {
  place: PlaceView;
  caption?: string;
  heading?: string;
  /** A module's subpage: its icon beside the h1. */
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <PageHead
          crumbs={<PlaceBreadcrumbs place={place} subpage={!!caption} />}
          title={heading ?? place.name}
          caption={caption}
          icon={icon}
        >
          {/* Like GOV.UK's "Change": back to the search on the home page,
            the band's last line. */}
          <p className="govuk-body">
            <Link href="/" className="govuk-link govuk-link--no-visited-state">
              Zmień adres
              <span className="govuk-visually-hidden"> {place.name}</span>
            </Link>
          </p>
        </PageHead>
        {children}
      </div>
    </div>
  );
}

/** "Lubaczów, ul. Adama Asnyka"; a village alone: "Basznia Dolna". */
export function placeCaption(place: PlaceView): string {
  return place.kind === "ulica" ? `${place.area}, ${place.name}` : place.name;
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
      label: place.name,
      href: placePath(place.id),
    });
  }
  return <Breadcrumbs items={items} />;
}

/**
 * The street page's dates, files and sources, or why there are none: the
 * waste module's subpage body (lib/modules.ts, /adres/<id>/smieci).
 */
export function WasteBody({ data: place }: { data: PlaceView }) {
  return (
    <>
      {place.zoneId === null ? (
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
          <PickupSchedule days={place.days} later={laterNote(place.days)} />

          {!place.verified && <AiReadNote text={unverifiedNote(place.gmina)} />}

          <CalendarBlock
            href={`/ics/${encodeURIComponent(place.zoneId)}`}
            label="Dodaj do kalendarza"
            refresh={wasteCalendarRefresh(place)}
            event="calendar_add"
            zone={place.zoneId}
            source="street"
            file={{
              href: `${placePath(place.id)}/harmonogram.pdf`,
              label: "Harmonogram do druku (PDF)",
              event: "pdf_open",
              zone: place.zoneId,
            }}
          />
        </>
      )}
      <SourceInset sources={wasteSources(place)} />
    </>
  );
}
