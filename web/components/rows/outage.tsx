import { Badge } from "@/components/badge";
import { Icon } from "@/components/icon";
import { fromTo } from "@/components/rows/when";
import { POWER_NO_HOURS } from "@/lib/power-module";
import type { Entry } from "@/lib/timeline";
import { NO_HOURS } from "@/lib/water-module";

// An outage's row on a day (components/function-rows.tsx), one for every
// module of outages (water, power: lib/upcoming.ts): a badge, what is cut,
// a chip per window of hours (each window its own, never a run-on
// sentence), then where. Only what is cut differs. The entries are alike
// in all but their hours (function-rows.tsx rowGroups).

/** What is cut, after „nie będzie” and „w dostawie”. */
export const CUT = { woda: "wody", prad: "prądu" } as const;

/** Each module's own words for a cut without hours. */
const NO_HOURS_OF = { woda: NO_HOURS, prad: POWER_NO_HOURS } as const;

/** Each window of hours a chip with its clock, in a list. */
export function TimeChips({ windows }: { windows: string[] }) {
  return (
    <ul className="app-chips">
      {windows.map((window) => (
        <li key={window} className="app-chip">
          <Icon name="clock" />
          {window}
        </li>
      ))}
    </ul>
  );
}

/** The entries' windows of hours (components/rows/when.ts). */
export const windowsOf = (entries: Entry[]) =>
  entries.map(({ item, continued }) => fromTo(item.span, continued));

export function OutageRow({ entries }: { entries: Entry[] }) {
  const [{ item, continued }] = entries;
  if (item.module !== "woda" && item.module !== "prad") return null;
  const noun = CUT[item.module];
  const hours = fromTo(item.span, continued) !== "";
  const text = continued
    ? "Przerwa trwa"
    : hours
      ? `Nie będzie ${noun}`
      : `Przerwa w dostawie ${noun}. ${NO_HOURS_OF[item.module]}`;
  return (
    <>
      <p className="govuk-body-s govuk-!-margin-bottom-0">
        <Badge tone={item.emergency ? "alert" : "mod"}>
          {item.emergency ? "Awaria" : "Planowana"}
        </Badge>{" "}
        {text}
      </p>
      {hours && <TimeChips windows={windowsOf(entries)} />}
      {item.second && (
        <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0 app-quiet">
          {item.second}
        </p>
      )}
    </>
  );
}
