import { Day, LaterCard } from "@/components/day";
import type { PlaceView } from "@/lib/schedule";
import { collapse, days, later, onDay } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";

/** What the timeline says with nothing in the window and nothing later. */
const EMPTY = "Na razie nic nie zaplanowano pod tym adresem.";

// „Najbliższe 7 dni”: h2, then a card per
// day from the read's day (lib/timeline.ts; a run of 2+ empty days as
// one, today included), then „Później”; with nothing in the window and
// nothing after it, one line instead (EMPTY). Never fetches: the hub's one read
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
  const byDay = list.map((day) => onDay(items, day, now));
  const groups = collapse(list, byDay);
  const after = later(items, list[list.length - 1], byDay).map((item) => ({
    item,
    continued: false,
  }));
  return (
    <section aria-labelledby="najblizsze-dni">
      <h2 id="najblizsze-dni" className="govuk-heading-m">
        Najbliższe {n} dni
      </h2>
      {byDay.every((entries) => entries.length === 0) && after.length === 0 ? (
        <p className="govuk-body">{EMPTY}</p>
      ) : (
        // A vertical timeline (site.scss .app-timeline): the
        // line, dots and carets are CSS only.
        <ol className="app-timeline">
          {groups.map((group) => (
            <Day key={group.from} group={group} place={place} />
          ))}
          {after.length > 0 && <LaterCard entries={after} place={place} />}
        </ol>
      )}
    </section>
  );
}
