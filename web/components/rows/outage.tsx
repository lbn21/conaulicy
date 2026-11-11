import { Icon } from "@/components/icon";
import { fromTo } from "@/components/rows/when";
import type { Entry } from "@/lib/timeline";
import { NO_HOURS } from "@/lib/water-module";

// An outage's row on a day (components/function-rows.tsx), one for every
// module of outages (water, power: lib/upcoming.ts): a badge, what is cut,
// a chip per window of hours (each window its own, never a run-on
// sentence), then where. Only what is cut differs. The entries are alike
// in all but their hours (function-rows.tsx rowGroups).

/** What is cut, after „nie będzie” and „w dostawie”. */
export const CUT = { woda: "wody", prad: "prądu" } as const;

/** The badge: a failure in red, else planned, in the module's colour. */
export function OutageBadge({ emergency }: { emergency: boolean }) {
  return emergency ? (
    <strong className="app-badge app-badge--alert">
      <Icon name="alert" />
      Awaria
    </strong>
  ) : (
    <strong className="app-badge app-badge--mod">Planowana</strong>
  );
}

/** Each window of hours a chip, in a list. */
export function TimeChips({ entries }: { entries: Entry[] }) {
  return (
    <ul className="app-chips">
      {entries.map(({ item, continued }) => (
        <li key={item.span.start} className="app-chip">
          <Icon name="clock" />
          {fromTo(item.span, continued)}
        </li>
      ))}
    </ul>
  );
}

export function OutageRow({ entries }: { entries: Entry[] }) {
  const [{ item, continued }] = entries;
  if (item.module !== "woda" && item.module !== "prad") return null;
  const noun = CUT[item.module];
  const hours = fromTo(item.span, continued) !== "";
  const text = continued
    ? "Przerwa trwa"
    : hours
      ? `Nie będzie ${noun}`
      : `Przerwa w dostawie ${noun}. ${NO_HOURS}`;
  return (
    <>
      <p className="govuk-body-s govuk-!-margin-bottom-0">
        <OutageBadge emergency={item.emergency} /> {text}
      </p>
      {hours && <TimeChips entries={entries} />}
      {item.second && (
        <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0 app-quiet">
          {item.second}
        </p>
      )}
    </>
  );
}
