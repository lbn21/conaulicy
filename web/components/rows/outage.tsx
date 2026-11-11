import { fromTo } from "@/components/rows/when";
import { capitalised } from "@/lib/dates";
import type { Entry } from "@/lib/timeline";
import { NO_HOURS } from "@/lib/water-module";

// An outage's row on a day (components/function-rows.tsx), one for every
// module of outages (water, power: lib/upcoming.ts): the hours, then where.
// Only what is cut differs.

/** What is cut, after „nie będzie” and „w dostawie”. */
const CUT = { woda: "wody", prad: "prądu" } as const;

export function OutageRow({ entry: { item, continued } }: { entry: Entry }) {
  if (item.module !== "woda" && item.module !== "prad") return null;
  const noun = CUT[item.module];
  const when = fromTo(item.span, continued);
  const cut = item.emergency ? " (awaria)" : "";
  const text = continued
    ? `Przerwa trwa ${when}${cut}.`
    : when
      ? `${capitalised(when)} nie będzie ${noun}${cut}.`
      : `Przerwa w dostawie ${noun}${cut}. ${NO_HOURS}`;
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
