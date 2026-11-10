import { fromTo } from "@/components/rows/when";
import { capitalised } from "@/lib/dates";
import type { Entry } from "@/lib/timeline";

// The IMGW row's value on a day (components/function-rows.tsx): its level
// tag, the event and its times; IMGW's own text is on /pogoda.
export function WeatherRow({ entry: { item, continued } }: { entry: Entry }) {
  if (item.module !== "pogoda") return null;
  const when = fromTo(item.span, continued);
  return (
    <p className="govuk-body govuk-!-margin-bottom-0">
      <strong className={item.level.tag}>{item.level.text}</strong>{" "}
      {capitalised(item.event)}
      {continued ? `, trwa ${when}.` : when ? `, ${when}.` : "."}
    </p>
  );
}
