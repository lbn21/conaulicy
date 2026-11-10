import { Bins } from "@/components/waste-bins";
import type { Entry } from "@/lib/timeline";

// The waste row's value on a day (components/function-rows.tsx): the bins,
// then when to put them out.
export function WasteRow({ entry: { item } }: { entry: Entry }) {
  if (item.module !== "smieci") return null;
  return (
    <>
      <Bins pickups={item.pickups ?? []} size="small" />
      {item.second && (
        <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0">
          {item.second}
        </p>
      )}
    </>
  );
}
