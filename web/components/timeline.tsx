import { Day, LaterCard } from "@/components/day";
import type { PlaceView } from "@/lib/schedule";
import { collapse, days, later, onDay } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";

// „Najbliższe 7 dni” (task 263): h2, then a card per
// day from the read's day (lib/timeline.ts; a run of 2+ empty days as
// one, today included), then „Później”. Never fetches: the hub's one read
// (components/hub.tsx hubData) gives every module's items.

export function Timeline({
  items,
  place,
  now,
  nothing,
  n = 7,
}: {
  items: Item[];
  place: PlaceView;
  now: number;
  /** What an empty day says (lib/timeline.ts nothingText). */
  nothing: string | null;
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
      {/* A vertical timeline (site.scss .app-timeline, task 264): the
          line, dots and carets are CSS only. */}
      <ol className="app-timeline">
        {groups.map((group) => (
          <Day key={group.from} group={group} place={place} nothing={nothing} />
        ))}
        {after.length > 0 && <LaterCard entries={after} place={place} />}
      </ol>
    </section>
  );
}
