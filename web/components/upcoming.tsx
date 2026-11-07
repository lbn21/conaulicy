import {
  type DayLabel,
  EmptyDays,
  TimelineDay,
} from "@/components/timeline-day";
import { dayFace } from "@/lib/dates";
import {
  cardWords,
  type DayRow,
  type Item,
  type Tag,
  timeline,
} from "@/lib/upcoming";

// „Najbliższe dni” (lib/upcoming.ts), read per request with the page
// (components/hub.tsx): a vertical timeline (task 261, a prototype; Jakub's
// design): every day of the next seven, today first, the date before what
// happens. A day with something on it: its marker, its heading, a card per
// item (its module's tag and icon, its hours, what happens, the second
// sentence). Days with nothing: one low line, a run of them one line. Then
// „Później”, the days past the window that have something. No links (task
// 260): each source is in its section below.

/** Each module's tag (a GOV.UK colour modifier, never the plain blue one). */
const TYPE = {
  smieci: { text: "Śmieci", tag: "govuk-tag govuk-tag--green" },
  woda: { text: "Woda", tag: "govuk-tag govuk-tag--turquoise" },
  pogoda: { text: "Pogoda", tag: "govuk-tag govuk-tag--purple" },
} as const;

/** Each module's icon (24×24, stroked), decorative: the tag says it. */
const ICON = {
  // A bin.
  smieci: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  // A drop.
  woda: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  // A warning sign.
  pogoda: "M12 3 2 20h20L12 3zM12 10v4M12 17v.01",
} as const;

const label = (day: string): DayLabel => {
  const face = dayFace(day);
  return { day, weekday: face.weekday, date: face.day, month: face.month };
};

/** The text with IMGW's level as its tag. */
function Text({ parts }: { parts: Array<string | Tag> }) {
  return (
    <>
      {parts.map((part, j) =>
        typeof part === "string" ? (
          part
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence
          <strong key={j} className={part.tag}>
            {part.text}
          </strong>
        ),
      )}
    </>
  );
}

/** A day's cards, in the one order (lib/upcoming.ts ordered). */
function Day({ row, now }: { row: DayRow; now: number }) {
  return (
    <TimelineDay label={label(row.day)}>
      <ul className="govuk-list app-timeline__cards">
        {row.items.map((item, i) => {
          const { when, text, second } = cardWords(item, row.day, now);
          const type = TYPE[item.module];
          return (
            // A fixed order, never reordered.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={i} className="app-timeline__card govuk-!-padding-3">
              <p className="govuk-body govuk-!-margin-bottom-2">
                <svg
                  aria-hidden="true"
                  focusable="false"
                  className="app-timeline__icon"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ICON[item.module]} />
                </svg>
                <strong className={type.tag}>{type.text}</strong>
              </p>
              {when && (
                <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
                  {when}
                </p>
              )}
              <p className="govuk-body govuk-!-margin-bottom-0">
                <Text parts={text} />
              </p>
              {second && (
                <p className="govuk-body govuk-!-margin-top-1 govuk-!-margin-bottom-0">
                  {second}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </TimelineDay>
  );
}

/** The block at `now`: the week, then „Później” if anything is further. */
export function Upcoming({ items, now }: { items: Item[]; now: number }) {
  const { week, later } = timeline(items, now);
  return (
    <>
      <section aria-labelledby="najblizsze-dni">
        <h2 id="najblizsze-dni" className="govuk-heading-m">
          Najbliższe dni
        </h2>
        <ol className="app-timeline">
          {week.map((row) =>
            row.kind === "day" ? (
              <Day key={row.day} row={row} now={now} />
            ) : (
              <EmptyDays
                key={row.from}
                from={label(row.from)}
                to={label(row.to)}
              />
            ),
          )}
        </ol>
        {later.length > 0 && (
          <>
            <h3 className="govuk-heading-s">Później</h3>
            <ol className="app-timeline">
              {later.map((row) => (
                <Day key={row.day} row={row} now={now} />
              ))}
            </ol>
          </>
        )}
      </section>
      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
    </>
  );
}
