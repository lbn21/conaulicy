import { fromTo } from "@/components/rows/when";
import { capitalised } from "@/lib/dates";
import type { Entry } from "@/lib/timeline";
import { NO_HOURS } from "@/lib/water-module";

// The water row's value on a day (components/function-rows.tsx): the
// hours, then where.
export function WaterRow({ entry: { item, continued } }: { entry: Entry }) {
  if (item.module !== "woda") return null;
  const when = fromTo(item.span, continued);
  const cut = item.emergency ? " (awaria)" : "";
  const text = continued
    ? `Przerwa trwa ${when}${cut}.`
    : when
      ? `${capitalised(when)} nie będzie wody${cut}.`
      : `Przerwa w dostawie wody${cut}. ${NO_HOURS}`;
  return (
    <>
      <p className="govuk-body-s govuk-!-margin-bottom-0">{text}</p>
      {item.second && (
        <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">
          {item.second}
        </p>
      )}
    </>
  );
}
