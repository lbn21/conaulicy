import { PlaceLink } from "@/components/place-link";
import { absoluteDay, capitalised } from "@/lib/dates";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";
import type { Entry } from "@/lib/timeline";

// A timeline card's rows (task 263): GOV.UK's summary list, a row per
// entry, its key the module's row label, its value the module's Row (or,
// in „Później”, the date alone), its action „Szczegóły” to the module's
// subpage, with a visually hidden suffix saying which (GOV.UK's „Change”
// links). The rows own no markup or links of their own.

/** A module's subpage, with the number as given (its breadcrumb back). */
export const subpageHref = (module: Module<unknown>, place: PlaceView) =>
  `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;

export function FunctionRows({
  entries,
  place,
  dateOnly = false,
}: {
  entries: Entry[];
  place: PlaceView;
  /** „Później”: the item's date as the value. */
  dateOnly?: boolean;
}) {
  return (
    <dl className="govuk-summary-list govuk-!-margin-bottom-0">
      {entries.map((entry, i) => {
        const module: Module<unknown> = MODULES[entry.item.module];
        const date = absoluteDay(entry.item.span.day);
        return (
          <div
            // A fixed order (lib/timeline.ts), never reordered.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={i}
            // The last row ends the card: no border under it (task 265).
            className={[
              "govuk-summary-list__row",
              module.Details ? "" : "govuk-summary-list__row--no-actions",
              i === entries.length - 1
                ? "govuk-summary-list__row--no-border"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <dt className="govuk-summary-list__key">{module.rowLabel}</dt>
            <dd className="govuk-summary-list__value">
              {dateOnly ? capitalised(date) : <module.Row entry={entry} />}
            </dd>
            {module.Details && (
              <dd className="govuk-summary-list__actions">
                <PlaceLink
                  className="govuk-link govuk-!-font-size-16"
                  href={subpageHref(module, place)}
                >
                  Szczegóły
                  <span className="govuk-visually-hidden">
                    {` ${module.hiddenLabel}, ${date}`}
                  </span>
                </PlaceLink>
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
