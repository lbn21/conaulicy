import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Parts } from "@/components/parts";
import type { Cadence } from "@/lib/cadence";
import {
  cadenceLine,
  type FreshSource,
  freshnessLine,
  type Part,
  sourceLine,
} from "@/lib/hub";

// The parts every address subpage shares (CLAUDE.md, "One layout for every
// address subpage"), in its order: after the module's content the AI-read
// note, then the actions (the calendar block), then the source and check
// time in an inset. One component each, so the subpages cannot drift.

/** The details' summary: how to add the file, and a browser never knows if it worked. */
export const CALENDAR_CHECK = "Jak dodać i sprawdzić, czy się udało?";

/** The details' bullets: the same words on each page. */
export const CALENDAR_STEPS = [
  "iPhone: telefon pokaże daty – potwierdź dodanie do kalendarza.",
  "Android: otwórz pobrany plik z powiadomienia albo z folderu Pobrane (na Samsungu: Moje pliki, potem Pobrane) i wybierz kalendarz, jeśli telefon zapyta.",
  "Potem otwórz kalendarz w telefonie i sprawdź najbliższą datę.",
  "Jeśli nic się nie stało, otwórz tę stronę w Safari (iPhone) albo w Chrome (Android). Przeglądarka w Messengerze czy Facebooku często blokuje pliki.",
  "Jeśli telefon nie otwiera pliku, możesz go dodać na komputerze: w Kalendarzu Google (calendar.google.com, Ustawienia, Importuj i eksportuj).",
];

/** The actions' heading: what the buttons below it are for. */
export const ACTIONS_HEADING = "Zapisz terminy";

/** A file the page offers beside the calendar (waste: the PDF). */
type FileAction = {
  href: string;
  label: string;
  /** The analytics event (components/web-analytics.tsx). */
  event: "pdf_open";
  zone?: string;
};

/**
 * The page's actions, after its content (docs/layout.md, step 7): an h2,
 * then GOV.UK's button group of secondary link buttons (links that look
 * and work like buttons; GOV.UK's Button JS makes Space activate them),
 * side by side from tablet, stacked full width on a phone: the page's
 * file first (the PDF, its icon), then „Dodaj … do kalendarza” (the
 * calendar's icon). No primary: the page's answer is its dates, not an
 * action. Under the group, in GOV.UK's details, how to add the calendar
 * file and what to do if nothing happened, after one line on when to
 * fetch it again (`refresh`, from the page's source). Only for a calendar file with
 * at least one event. `event` and its properties, whichever are given,
 * are what components/web-analytics.tsx sends on a click.
 */
export function CalendarBlock({
  href,
  label,
  refresh,
  event,
  zone,
  source,
  place,
  file,
}: {
  href: string;
  label: string;
  refresh: string;
  event: "calendar_add" | "water_calendar_add";
  zone?: string;
  source?: string;
  place?: string;
  file?: FileAction;
}) {
  return (
    <section aria-labelledby="zapisz">
      <h2 id="zapisz" className="govuk-heading-m">
        {ACTIONS_HEADING}
      </h2>
      <div className="govuk-button-group">
        {file && (
          // biome-ignore lint/a11y/useSemanticElements: it opens a file, so it stays a link, as GOV.UK documents
          <a
            href={file.href}
            role="button"
            draggable="false"
            className="govuk-button govuk-button--secondary"
            data-module="govuk-button"
            data-event={file.event}
            data-zone={file.zone}
          >
            <Icon name="file" />
            {file.label}
          </a>
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: it navigates to a file, so it stays a link, as GOV.UK documents */}
        <a
          href={href}
          role="button"
          draggable="false"
          className="govuk-button govuk-button--secondary"
          data-module="govuk-button"
          data-event={event}
          data-zone={zone}
          data-source={source}
          data-place={place}
        >
          <Icon name="calendar" />
          {label}
        </a>
      </div>
      <details className="govuk-details">
        <summary className="govuk-details__summary">
          <span className="govuk-details__summary-text">{CALENDAR_CHECK}</span>
        </summary>
        <div className="govuk-details__text">
          <p className="govuk-body">{refresh}</p>
          <ul className="govuk-list govuk-list--bullet">
            {CALENDAR_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

/** GOV.UK's warning text: dates read by AI, the source's own word wins. */
export function AiReadNote({ text }: { text: string }) {
  return (
    <div className="govuk-warning-text">
      <span className="govuk-warning-text__icon" aria-hidden="true">
        !
      </span>
      <strong className="govuk-warning-text__text">
        <span className="govuk-visually-hidden">Uwaga</span>
        {text}
      </strong>
    </div>
  );
}

/**
 * Every source note, the same everywhere (t373): at the page's bottom, in
 * GOV.UK's inset text, small, secondary text: the source, then the live
 * sources' freshness line („Bez zmian od …”, lib/hub.ts freshnessLine) on
 * its own line, 10 px under the source, and under it how often each is
 * checked (cadenceLine). Static: written with the page, no script touches it.
 * The subpages' (SourceInset), the address page's (components/hub.tsx) and
 * the home panel's. Neither: nothing.
 */
export function SourceNote({
  source,
  fresh,
}: {
  source?: ReactNode;
  /** The live sources (freshnessLine); none shown: no line, no cadence. */
  fresh?: FreshSource[];
}) {
  const line = freshnessLine(fresh ?? []);
  const cadence = cadenceLine(fresh ?? []);
  if (!source && !line) return null;
  return (
    <div className="govuk-inset-text">
      {source && (
        <p
          className={
            line
              ? "govuk-body-s app-quiet govuk-!-margin-bottom-2"
              : "govuk-body-s app-quiet"
          }
        >
          {source}
        </p>
      )}
      {line && (
        <>
          <p className="govuk-body-s app-quiet govuk-!-margin-bottom-2">
            {line}
          </p>
          <p className="govuk-body-s app-quiet">{cadence}</p>
        </>
      )}
    </div>
  );
}

/**
 * The subpage's one source block, at the bottom (SourceNote): „Źródło: ‹its
 * sources›.”, then, for a live source (`changedAt`), its freshness line.
 * The waste schedule: its source line only.
 */
export function SourceInset({
  sources,
  changedAt = null,
  cadence = null,
}: {
  sources: Part[][];
  /** When the live source's data last changed (ms); null: none shown. */
  changedAt?: number | null;
  /** How often it is checked (lib/cadence.ts); null: no live source. */
  cadence?: Cadence | null;
}) {
  const line = sourceLine(sources);
  return (
    <SourceNote
      source={line.length > 0 && <Parts parts={line} lead={false} />}
      fresh={cadence === null ? [] : [{ name: null, changedAt, cadence }]}
    />
  );
}
