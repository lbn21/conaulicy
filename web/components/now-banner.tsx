import Link from "next/link";
import { subpageHref } from "@/components/function-rows";
import { Icon, Tile } from "@/components/icon";
import { CUT, TimeChips, windowsOf } from "@/components/rows/outage";
import { MODULES, type Module } from "@/lib/modules";
import type { PlaceView } from "@/lib/schedule";
import type { Item } from "@/lib/upcoming";

// The address page's banner, at its top, only while a failure is on at the
// address now (an outage item marked emergency whose span holds the read's
// instant): GOV.UK red, „Teraz trwa awaria”, then each cut, its hours as
// chips and its subpage. Read per request with the page; nothing appears
// later on its own. None: no markup at all.

/**
 * The failures on at `now`: begun, and not over, an estimated end (`about`)
 * never over while the source lists it (lib/timeline.ts onDay).
 */
const failuresNow = (items: Item[], now: number) =>
  items.filter(
    (item) =>
      item.module !== "smieci" &&
      item.emergency &&
      Date.parse(item.span.start) <= now &&
      (item.span.about || now < Date.parse(item.span.end)),
  );

export function NowBanner({
  items,
  place,
  now,
}: {
  items: Item[];
  place: PlaceView;
  now: number;
}) {
  const failures = failuresNow(items, now);
  if (failures.length === 0) return null;
  return (
    <section className="app-alert" aria-labelledby="teraz">
      <h2 id="teraz" className="govuk-heading-m app-alert__title">
        <Icon name="alert" />
        Teraz trwa awaria
      </h2>
      <ul className="govuk-list govuk-!-margin-bottom-0">
        {failures.map((item) => {
          if (item.module === "smieci") return null;
          const module: Module<unknown> = MODULES[item.module];
          return (
            <li
              key={`${item.module}-${item.span.start}`}
              className={`app-alert__item app-mod app-mod--${module.id}`}
            >
              <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-0">
                <Tile name={module.id} />
                Nie ma {CUT[item.module]}
              </p>
              <TimeChips
                windows={windowsOf([
                  { item, continued: item.span.day !== place.today },
                ])}
              />
              <Link
                className="govuk-link govuk-!-font-size-16 govuk-!-display-inline-block govuk-!-margin-top-2"
                href={subpageHref(module, place)}
              >
                Szczegóły
                <span className="govuk-visually-hidden">{` ${module.hiddenLabel}`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
