import { Icon, Tile } from "@/components/icon";
import type { ShownWarning } from "@/lib/imgw-shown";
import { warningWhen } from "@/lib/weather-module";

// IMGW's warnings on the address page, with a
// meter: a card each, directly above „Najbliższe 7 dni”, highest level
// first, then the earliest (lib/imgw-warnings.ts forPowiat). Its top band
// in the level's colour (IMGW's map, lib/palette.ts WARNING_LEVELS; text
// black on yellow and orange, white on red) holds a 3-segment meter and
// „Stopień N z 3”, so the level never rests on colour alone; then the
// event (h2), when, and IMGW's own description in GOV.UK's details. No
// source or check time here: the page's small print has them. None: no
// markup at all.

export function WarningCards({
  warnings,
  now,
}: {
  warnings: ShownWarning[];
  now: number;
}) {
  return warnings.map((warning) => (
    <section
      key={warning.id}
      className={`app-warning app-warning--${warning.level}`}
      aria-labelledby={`ostrzezenie-${warning.id}`}
    >
      <p className="app-warning__level govuk-body-s govuk-!-font-weight-bold">
        <span className="app-warning__meter" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={step <= warning.level ? "app-warning__on" : undefined}
            />
          ))}
        </span>
        <Icon name="alert" />
        Stopień {warning.level} z 3
      </p>
      <div className="app-warning__body app-mod app-mod--pogoda">
        <h2
          id={`ostrzezenie-${warning.id}`}
          className="govuk-heading-m govuk-!-margin-bottom-2"
        >
          <Tile name="pogoda" />
          {warning.event}
        </h2>
        <p className="govuk-body">{warningWhen(warning, now)}</p>
        <details className="govuk-details govuk-!-margin-bottom-0">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Co przekazuje IMGW
            </span>
          </summary>
          <div className="govuk-details__text">{warning.text}</div>
        </details>
      </div>
    </section>
  ));
}
