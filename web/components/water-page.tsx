import { Parts } from "@/components/parts";
import { fromTo } from "@/components/rows/when";
import {
  AiReadNote,
  CalendarBlock,
  SourceInset,
} from "@/components/subpage-parts";
import { absoluteDay } from "@/lib/dates";
import { waterCalendarHref } from "@/lib/water-ics";
import {
  cutSpan,
  cutWhere,
  NO_HOURS,
  noticeLink,
  staleNote,
  type Water,
  waterAiNote,
  waterCalendarHint,
  waterChecked,
  waterEmpty,
  waterSources,
  waterTrace,
} from "@/lib/water-module";

// The water module's subpage, /adres/<id>/woda (lib/modules.ts), under
// ModuleMain's breadcrumbs, in the subpages' one layout (docs/layout.md):
// „Dodaj przerwy do kalendarza” when any cut can go in a calendar
// (lib/water-ics.ts), then every planned cut still to come at this
// address, a day each, with its hours and what is cut, then posts we could
// not match to addresses, as links only, then the AI-read note, and the
// posts (or, with none, the news pages) as the source with the check time. Read per request with the whole page
// (components/module-page.tsx subpageData), so the cuts are those not over
// now, from the cron's last file. Dates are absolute; a
// day's „Dziś” or „Jutro” comes with them (components/day-word.tsx).

/** The subpage's body, under its heading (components/module-page.tsx Subpage). */
export function WaterDetails({ data }: { data: Water }) {
  const note = staleNote(data);
  const empty = waterEmpty(data);
  const trace = waterTrace(data);
  const dates = [...new Set(data.outages.map((cut) => cut.date))];
  const calendar = waterCalendarHref(data);
  return (
    <>
      {note && (
        <div className="govuk-inset-text">
          <Parts parts={note} lead={false} />
        </div>
      )}
      {calendar && (
        <CalendarBlock
          href={calendar}
          label="Dodaj przerwy do kalendarza"
          hint={waterCalendarHint(data)}
          event="water_calendar_add"
          place={data.place.id}
        />
      )}
      {empty ? (
        <p className="govuk-body">
          <Parts parts={empty} lead={false} />
        </p>
      ) : (
        dates.map((date) => (
          <section key={date} aria-labelledby={`dzien-${date}`}>
            <h2 id={`dzien-${date}`} className="govuk-heading-m">
              <Parts parts={[{ day: date, text: absoluteDay(date) }]} lead />
            </h2>
            {data.outages
              .filter((cut) => cut.date === date)
              .map((cut) => (
                <dl key={cut.uid} className="govuk-summary-list">
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Godziny</dt>
                    <dd className="govuk-summary-list__value">
                      {fromTo(cutSpan(cut), false) || NO_HOURS}
                    </dd>
                  </div>
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Gdzie</dt>
                    <dd className="govuk-summary-list__value">
                      {cutWhere(cut, data.place)}
                    </dd>
                  </div>
                </dl>
              ))}
          </section>
        ))
      )}
      {trace && <p className="govuk-body">{trace}</p>}
      {data.notices.length > 0 && (
        <section aria-labelledby="inne-komunikaty">
          <h2 id="inne-komunikaty" className="govuk-heading-m">
            Inne komunikaty
          </h2>
          {data.notices.map((notice) => (
            <p key={notice.uid} className="govuk-body">
              <Parts parts={[noticeLink(notice)]} lead={false} />
            </p>
          ))}
        </section>
      )}
      {!empty && <AiReadNote text={waterAiNote(data)} />}
      <SourceInset sources={waterSources(data)} at={waterChecked(data)} />
    </>
  );
}
