import { Bins } from "@/components/waste-bins";
import type { Entry } from "@/lib/timeline";

// The waste row's value on a day (components/function-rows.tsx): the bins
// as chips, then when to put them out.
export function WasteRow({ entries }: { entries: Entry[] }) {
  const pickups = entries.flatMap(({ item }) =>
    item.module === "smieci" ? (item.pickups ?? []) : [],
  );
  const second = entries[0].item.second;
  return (
    <>
      <Bins pickups={pickups} size="small" />
      {second && (
        <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0 app-quiet">
          {second}
        </p>
      )}
    </>
  );
}
