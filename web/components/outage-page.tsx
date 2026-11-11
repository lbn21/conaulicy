import type { ReactNode } from "react";
import { Parts } from "@/components/parts";
import {
  AiReadNote,
  CalendarBlock,
  SourceInset,
} from "@/components/subpage-parts";
import { absoluteDay } from "@/lib/dates";
import type { OutagePage } from "@/lib/outage-view";

// An outages subpage's body (/adres/<id>/woda, /prad; lib/modules.ts),
// under ModuleMain's breadcrumbs, in the subpages' one layout
// (docs/layout.md), the same for whatever is cut: the inset when the data
// may be out of date, the calendar block when there is one, then every
// outage still to come at this address, a day each, a summary list each,
// then other notices as links, the read-by-a-program note, and the source
// with the check time. Read per request with the whole page
// (components/module-page.tsx subpageData). Dates are absolute; a day's
// „Dziś” or „Jutro” comes with them (components/day-word.tsx). Each
// module fills lib/outage-view.ts OutagePage from its own data.

function OutageDetails({ page }: { page: OutagePage }) {
  return (
    <>
      {page.note && (
        <div className="govuk-inset-text">
          <Parts parts={page.note} lead={false} />
        </div>
      )}
      {page.calendar && (
        <CalendarBlock
          href={page.calendar.href}
          label={page.calendar.label}
          hint={page.calendar.hint}
          event={page.calendar.event}
          place={page.calendar.place}
        />
      )}
      {page.empty ? (
        <p className="govuk-body">
          <Parts parts={page.empty} lead={false} />
        </p>
      ) : (
        page.days.map(({ date, blocks }) => (
          <section key={date} aria-labelledby={`dzien-${date}`}>
            <h2 id={`dzien-${date}`} className="govuk-heading-m">
              <Parts parts={[{ day: date, text: absoluteDay(date) }]} lead />
            </h2>
            {blocks.map((block) => (
              <dl key={block.key} className="govuk-summary-list">
                {block.rows.map((row) => (
                  <div key={row.key} className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">{row.key}</dt>
                    <dd className="govuk-summary-list__value">
                      {row.tag && (
                        <>
                          <strong className="govuk-tag govuk-tag--grey">
                            {row.tag}
                          </strong>{" "}
                        </>
                      )}
                      <Parts parts={row.value} lead={false} />
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          </section>
        ))
      )}
      {page.trace && <p className="govuk-body">{page.trace}</p>}
      {page.others.length > 0 && (
        <section aria-labelledby="inne-komunikaty">
          <h2 id="inne-komunikaty" className="govuk-heading-m">
            Inne komunikaty
          </h2>
          {page.others.map(({ key, parts }) => (
            <p key={key} className="govuk-body">
              <Parts parts={parts} lead={false} />
            </p>
          ))}
        </section>
      )}
      {page.aiNote && <AiReadNote text={page.aiNote} />}
      <SourceInset sources={page.sources} at={page.checkedAt} />
    </>
  );
}

/**
 * A module's subpage body (Module.Details) from its data: `page` fills the
 * one shape (lib/outage-view.ts).
 */
export function outageDetails<D>(
  page: (data: D) => OutagePage,
): (props: { data: D }) => ReactNode {
  return function Details({ data }) {
    return <OutageDetails page={page(data)} />;
  };
}
