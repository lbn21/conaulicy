import type { ReactNode } from "react";

// The parts every address subpage shares (CLAUDE.md, "One layout for every
// address subpage"), in its order: the calendar block under the checked
// line, the AI-read note after the module's content, then the source in an
// inset. One component each, so the subpages cannot drift.

/** How to add the file, under every calendar button: the same words on each page. */
export const CALENDAR_HOW =
  "Na iPhonie telefon pokaże daty – potwierdź dodanie do kalendarza. Na Androidzie otwórz pobrany plik z powiadomienia albo z folderu Pobrane i wybierz kalendarz, jeśli telefon zapyta.";

/** The details' summary: a browser never knows if the import worked. */
export const CALENDAR_CHECK = "Nie wiesz, czy się udało?";

/**
 * „Dodaj … do kalendarza”: GOV.UK's link button, a link that looks and
 * works like a button (GOV.UK's Button JS makes Space activate it), then
 * the page's line on what the file is, how to add it and, in GOV.UK's
 * details, what to do if nothing happened. Only for a file with at least
 * one event. `event` and its properties, whichever are given, are what
 * components/web-analytics.tsx sends on a click.
 */
export function CalendarBlock({
  href,
  label,
  hint,
  event,
  zone,
  source,
  place,
}: {
  href: string;
  label: string;
  hint: string;
  event: "calendar_add" | "water_calendar_add";
  zone?: string;
  source?: string;
  place?: string;
}) {
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: it navigates to a file, so it stays a link, as GOV.UK documents */}
      <a
        href={href}
        role="button"
        draggable="false"
        className="govuk-button"
        data-module="govuk-button"
        data-event={event}
        data-zone={zone}
        data-source={source}
        data-place={place}
      >
        {label}
      </a>
      <p className="govuk-body">{`${hint} ${CALENDAR_HOW}`}</p>
      <details className="govuk-details">
        <summary className="govuk-details__summary">
          <span className="govuk-details__summary-text">{CALENDAR_CHECK}</span>
        </summary>
        <div className="govuk-details__text">
          <ul className="govuk-list govuk-list--bullet">
            <li>Otwórz kalendarz w telefonie i sprawdź najbliższą datę.</li>
            <li>
              Jeśli nic się nie stało, otwórz tę stronę w Safari (iPhone) albo w
              Chrome (Android). Przeglądarka w Messengerze czy Facebooku często
              blokuje pliki.
            </li>
            <li>
              Kalendarz Google: plik można dodać tylko na komputerze, na
              calendar.google.com w Ustawieniach, w części Importuj i eksportuj.
            </li>
          </ul>
        </div>
      </details>
    </>
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

/** The sources, a paragraph each, in GOV.UK's inset text. */
export function SourceInset({ children }: { children: ReactNode }) {
  return <div className="govuk-inset-text">{children}</div>;
}
