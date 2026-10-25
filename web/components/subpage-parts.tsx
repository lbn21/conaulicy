import type { ReactNode } from "react";

// The parts every address subpage shares (CLAUDE.md, "One layout for every
// address subpage"), in its order: the calendar block under the checked
// line, the AI-read note after the module's content, then the source in an
// inset. One component each, so the subpages cannot drift.

/**
 * „Dodaj … do kalendarza”: GOV.UK's link button, a link that looks and
 * works like a button (GOV.UK's Button JS makes Space activate it), then
 * one line on what the file does. Only for a file with at least one event.
 * `event` and its properties, whichever are given, are what
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
      <p className="govuk-body">{hint}</p>
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
