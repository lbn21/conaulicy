import { Day, LaterCard } from "@/components/day";
import { MODULES } from "@/lib/modules";
import type { PlaceView } from "@/lib/schedule";
import { collapse, days, later, onDay, summary } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";

// „Najbliższe 7 dni” (task 263): h2, one summary sentence, then a card per
// day from the read's day (lib/timeline.ts; a run of 2+ empty days after
// today as one), then „Później”. Never fetches: the hub's one read
// (components/hub.tsx hubData) gives every module's items.

export function Timeline({
  items,
  place,
  now,
  n = 7,
}: {
  items: Item[];
  place: PlaceView;
  now: number;
  n?: number;
}) {
  const list = days(place.today, n);
  const groups = collapse(
    list,
    list.map((day) => onDay(items, day, now)),
  );
  const after = later(items, list[list.length - 1]).map((item) => ({
    item,
    continued: false,
  }));
  return (
    <section aria-labelledby="najblizsze-dni">
      <h2 id="najblizsze-dni" className="govuk-heading-m">
        Najbliższe {n} dni
      </h2>
      <p className="govuk-body">
        {summary(items, place.today, n, (id) => MODULES[id].noun, now)}
      </p>
      <ol className="govuk-list">
        {groups.map((group) => (
          <li key={group.from}>
            <Day group={group} place={place} />
          </li>
        ))}
        {after.length > 0 && (
          <li>
            <LaterCard entries={after} place={place} />
          </li>
        )}
      </ol>
    </section>
  );
}
