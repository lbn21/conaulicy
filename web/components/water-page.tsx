import type { Metadata } from "next";
import { NOT_FOUND_TITLE } from "@/components/page-not-found";
import { Parts } from "@/components/parts";
import { SubpageHeading } from "@/components/place-page";
import { absoluteDay } from "@/lib/dates";
import { withHouseNumber } from "@/lib/house";
import type { Checked } from "@/lib/hub";
import { indexable } from "@/lib/indexing";
import { placePath } from "@/lib/places";
import { getPlace } from "@/lib/schedule";
import { pageMetadata } from "@/lib/share";
import { calendarCuts } from "@/lib/water-ics";
import {
  hours,
  noticeLink,
  postLink,
  scope,
  staleNote,
  type Water,
  waterEmpty,
} from "@/lib/water-module";

// The water module's subpage, /adres/<id>/woda (lib/modules.ts), under
// ModuleMain's breadcrumbs: every planned cut still to come at this
// address, a day each, with its hours, what is cut and the gmina's post;
// then „Dodaj przerwy do kalendarza” when any of them can go in a calendar
// (lib/water-ics.ts), then posts we could not match to addresses, as links
// only. Dates are absolute, so a cached copy stays true.

const H1 = "Przerwy w dostawie wody";

/**
 * Title "Przerwy w dostawie wody – <place>", its own canonical; never a
 * search result (its content lasts days), its links followed.
 */
export async function waterMetadata(
  id: string,
  nr: string | null,
): Promise<Metadata> {
  const place = await getPlace(id, nr);
  // As placeMetadata: Next.js's own noindex is the only robots tag.
  if (!place) return { title: NOT_FOUND_TITLE, robots: null };
  return {
    ...pageMetadata({
      path: `${placePath(id)}/woda`,
      title: `${H1} – ${withHouseNumber(place.name, place.nr)}`,
      description: `Zapowiedziane przerwy w dostawie wody: ${place.label}. Daty i godziny z komunikatów gminy.`,
    }),
    robots: { index: false, follow: indexable() },
  };
}

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function WaterDetails({
  data,
  checkedAt = null,
}: {
  data: Water;
  checkedAt?: Checked;
}) {
  const note = staleNote(data);
  const empty = waterEmpty(data);
  const dates = [...new Set(data.outages.map((cut) => cut.date))];
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <SubpageHeading place={data.place} heading={H1} checkedAt={checkedAt} />
        {note && (
          <div className="govuk-inset-text">
            <Parts parts={note} />
          </div>
        )}
        {empty ? (
          <p className="govuk-body">
            <Parts parts={empty} />
          </p>
        ) : (
          <>
            {dates.map((date) => (
              <section key={date} aria-labelledby={`dzien-${date}`}>
                <h2 id={`dzien-${date}`} className="govuk-heading-m">
                  {capitalised(absoluteDay(date))}
                </h2>
                {data.outages
                  .filter((cut) => cut.date === date)
                  .map((cut) => (
                    <dl key={cut.uid} className="govuk-summary-list">
                      <div className="govuk-summary-list__row">
                        <dt className="govuk-summary-list__key">Godziny</dt>
                        <dd className="govuk-summary-list__value">
                          {hours(cut) ?? "komunikat ich nie podaje"}
                        </dd>
                      </div>
                      <div className="govuk-summary-list__row">
                        <dt className="govuk-summary-list__key">Gdzie</dt>
                        <dd className="govuk-summary-list__value">
                          {scope(cut)}
                        </dd>
                      </div>
                      <div className="govuk-summary-list__row">
                        <dt className="govuk-summary-list__key">Źródło</dt>
                        <dd className="govuk-summary-list__value">
                          <Parts parts={[postLink(cut)]} />
                        </dd>
                      </div>
                    </dl>
                  ))}
              </section>
            ))}
            {calendarCuts(data).length > 0 && (
              <>
                {/* GOV.UK's link button, as the waste calendar's
                    (components/place-page.tsx): a file, so a link. */}
                {/* biome-ignore lint/a11y/useSemanticElements: it navigates to a file, so it stays a link, as GOV.UK documents */}
                <a
                  href={`${placePath(data.place.id)}/woda.ics${data.place.givenNr ? `?nr=${data.place.givenNr}` : ""}`}
                  role="button"
                  draggable="false"
                  className="govuk-button govuk-button--secondary"
                  data-module="govuk-button"
                >
                  Dodaj przerwy do kalendarza
                </a>
                <p className="govuk-body">
                  Jeśli gmina zmieni godziny, pobierz plik jeszcze raz –
                  kalendarz poprawi wpis.
                </p>
              </>
            )}
            <p className="govuk-body">
              Daty i godziny odczytaliśmy z komunikatu gminy. Gdyby coś się nie
              zgadzało, rację ma komunikat.
            </p>
          </>
        )}
        {data.notices.length > 0 && (
          <section aria-labelledby="inne-komunikaty">
            <h2 id="inne-komunikaty" className="govuk-heading-m">
              Inne komunikaty
            </h2>
            {data.notices.map((notice) => (
              <p key={notice.uid} className="govuk-body">
                <Parts parts={[noticeLink(notice)]} />
              </p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
