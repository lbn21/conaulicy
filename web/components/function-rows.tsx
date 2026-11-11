import { Tile } from "@/components/icon";
import { PlaceLink } from "@/components/place-link";
import { absoluteDay, capitalised, dayWithYear } from "@/lib/dates";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";
import type { Entry } from "@/lib/timeline";

// A timeline card's rows: GOV.UK's summary list, a row per
// group of entries (rowGroups), its key the module's icon on its colour's
// tile and its row label, its value the module's Row (or, in „Później”,
// the date alone, with its year), its action „Szczegóły” to the module's
// subpage, with a visually hidden suffix saying which (GOV.UK's „Change”
// links). The rows own no markup or links of their own.

/** A module's subpage, with the number as given (its breadcrumb back). */
export const subpageHref = (module: Module<unknown>, place: PlaceView) =>
  `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;

/** What makes entries one row: all but their hours. */
const rowKey = ({ item, continued }: Entry) =>
  JSON.stringify([
    item.module,
    item.span.day,
    item.second,
    item.module === "smieci" || item.emergency,
    continued,
  ]);

/**
 * Entries in a row: neighbours alike in all but their hours (rowKey) share
 * one, so a day's two windows of the same cut are one row with a chip each.
 */
function rowGroups(entries: Entry[]): Entry[][] {
  const groups: Entry[][] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && rowKey(last[0]) === rowKey(entry)) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

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
  const groups = rowGroups(entries);
  return (
    <dl className="govuk-summary-list govuk-!-margin-bottom-0">
      {groups.map((group, i) => {
        const { item } = group[0];
        const module: Module<unknown> = MODULES[item.module];
        const date = absoluteDay(item.span.day);
        return (
          <div
            // A fixed order (lib/timeline.ts), never reordered.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={i}
            // The last row ends the card: no border under it.
            className={[
              "govuk-summary-list__row",
              `app-mod app-mod--${module.id}`,
              i === groups.length - 1
                ? "govuk-summary-list__row--no-border"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <dt className="govuk-summary-list__key">
              <Tile name={module.id} />
              {module.rowLabel}
            </dt>
            <dd className="govuk-summary-list__value">
              {dateOnly ? (
                capitalised(dayWithYear(item.span.day))
              ) : (
                <module.Row entries={group} />
              )}
            </dd>
            <dd className="govuk-summary-list__actions">
              <PlaceLink
                className="govuk-link"
                href={subpageHref(module, place)}
              >
                Szczegóły
                <span className="govuk-visually-hidden">
                  {` ${module.hiddenLabel}, ${date}`}
                </span>
              </PlaceLink>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
