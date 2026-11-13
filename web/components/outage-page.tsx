import type { ReactNode } from "react";
import { Badge } from "@/components/badge";
import { Parts } from "@/components/parts";
import { TimeChips } from "@/components/rows/outage";
import {
  AiReadNote,
  CalendarBlock,
  SourceInset,
} from "@/components/subpage-parts";
import { absoluteDay } from "@/lib/dates";
import type { Part } from "@/lib/hub";
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

/**
 * A value longer than this (its text, in characters) folds into GOV.UK's
 * details, „Pokaż całą listę”: PGE's lists of house numbers run to
 * hundreds.
 */
const FOLD = 160;

const textOf = (parts: Part[]) =>
  parts
    .map((part) =>
      typeof part === "string" ? part : "text" in part ? part.text : "",
    )
    .join("");

/** A row's value: its parts, folded when long (FOLD). */
function Value({ parts }: { parts: Part[] }) {
  if (textOf(parts).length <= FOLD) return <Parts parts={parts} lead={false} />;
  return (
    <details className="govuk-details govuk-!-margin-bottom-0">
      <summary className="govuk-details__summary">
        <span className="govuk-details__summary-text">Pokaż całą listę</span>
      </summary>
      <div className="govuk-details__text">
        <Parts parts={parts} lead={false} />
      </div>
    </details>
  );
}

function OutageDetails({ page }: { page: OutagePage }) {
  return (
    <>
      {page.note && (
        <div className="govuk-inset-text">
          <Parts parts={page.note} lead={false} />
        </div>
      )}
      {page.empty ? (
        <p className="app-empty govuk-body">
          <Parts parts={page.empty} lead={false} />
        </p>
      ) : (
        page.days.map(({ date, blocks }) => (
          <section key={date} aria-labelledby={`dzien-${date}`}>
            <h2 id={`dzien-${date}`} className="govuk-heading-m">
              <Parts parts={[{ day: date, text: absoluteDay(date) }]} lead />
            </h2>
            {/* A card per outage (site.scss .app-card), its rows a
              summary list: badges, a chip per window of hours. */}
            {blocks.map((block) => (
              <div key={block.key} className="app-card">
                <dl className="govuk-summary-list govuk-!-margin-bottom-0">
                  {block.rows.map((row) => (
                    <div key={row.key} className="govuk-summary-list__row">
                      <dt className="govuk-summary-list__key">{row.key}</dt>
                      <dd className="govuk-summary-list__value">
                        {row.badge && (
                          <>
                            <Badge tone={row.badge.tone}>
                              {row.badge.text}
                            </Badge>
                            {row.value.length > 0 && " "}
                          </>
                        )}
                        <Value parts={row.value} />
                        {row.chips && <TimeChips windows={row.chips} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        ))
      )}
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
      {page.calendar && (
        <CalendarBlock
          href={page.calendar.href}
          label={page.calendar.label}
          refresh={page.calendar.refresh}
          event={page.calendar.event}
          place={page.calendar.place}
        />
      )}
      <SourceInset sources={page.sources} changedAt={page.changedAt} />
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
