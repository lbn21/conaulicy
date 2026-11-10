import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { CheckedLine } from "@/components/checked-line";
import { Parts, textOf } from "@/components/parts";
import {
  AiReadNote,
  CalendarBlock,
  moduleMetadata,
  SourceInset,
} from "@/components/subpage-parts";
import { absoluteDay } from "@/lib/dates";
import type { Checked } from "@/lib/hub";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";
import { waterCalendarHref } from "@/lib/water-ics";
import {
  cutWhere,
  hours,
  noticeLink,
  staleNote,
  type Water,
  waterAiNote,
  waterCalendarHint,
  waterEmpty,
  waterSources,
  waterTrace,
} from "@/lib/water-module";
import { sourcesAt } from "@/lib/water-sources";

// The water module's subpage, /adres/<id>/woda (lib/modules.ts), under
// ModuleMain's breadcrumbs, in the subpages' one layout (docs/layout.md):
// „Dodaj przerwy do kalendarza” when any cut can go in a calendar
// (lib/water-ics.ts), then every planned cut still to come at this
// address, a day each, with its hours and what is cut, then posts we could
// not match to addresses, as links only, then the AI-read note and the
// posts as the source. Read per request with the whole page
// (components/module-page.tsx subpageData), so the cuts are those not over
// now, from the cron's last file. Dates are absolute; a
// day's „Dziś” or „Jutro” comes with them (components/day-word.tsx).

const H1 = "Przerwy w dostawie wody";

/** /woda's metadata (components/subpage-parts.tsx moduleMetadata). */
export async function waterMetadata(
  id: string,
  nr: string | null,
): Promise<Metadata> {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  return moduleMetadata(
    id,
    await getPlace(id, nr),
    "woda",
    H1,
    (place) =>
      `Zapowiedziane przerwy w dostawie wody: ${place.label}. Daty i godziny z komunikatów ${sourcesAt(
        place.localityId,
      )
        .map((s) => s.of)
        .join(" i ")}.`,
  );
}

/**
 * The subpage's body, under its heading (components/module-page.tsx
 * ModuleMain): first when we checked, from the same read as the cuts.
 */
export function WaterDetails({
  data,
  checkedAt = null,
}: {
  data: Water;
  checkedAt?: Checked;
}) {
  const note = staleNote(data);
  const empty = waterEmpty(data);
  const trace = waterTrace(data);
  const dates = [...new Set(data.outages.map((cut) => cut.date))];
  const calendar = waterCalendarHref(data);
  return (
    <>
      <CheckedLine at={checkedAt} module="woda" />
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
                      {hours(cut) ?? "komunikat ich nie podaje"}
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
      {!empty && (
        <>
          <AiReadNote text={waterAiNote(data)} />
          <SourceInset>
            {waterSources(data).map((parts) => (
              <p key={textOf(parts)} className="govuk-body">
                Źródło: <Parts parts={parts} lead={false} />
              </p>
            ))}
          </SourceInset>
        </>
      )}
    </>
  );
}
