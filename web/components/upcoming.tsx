import { DayWord } from "@/components/day-word";
import { type Item, LINK_NAME, visible, words } from "@/lib/upcoming";

// „Najbliższe dni” (lib/upcoming.ts), read per request in its own block
// (components/hub.tsx UpcomingLive): what is shown at `now`, in the one
// order, every date absolute, the lead's „Dziś” or „Jutro” the device's
// (components/day-word.tsx). Always its heading: with nothing shown, one
// plain line, so the block keeps its place (task 235).

/** What the block says when nothing is shown. */
export const NOTHING_SOON =
  "W najbliższych dniach nic się u Ciebie nie dzieje.";

/** The block's lines at `now`, or NOTHING_SOON. */
export function Upcoming({ items, now }: { items: Item[]; now: number }) {
  const shown = items.filter((item) => visible(item, now));
  return (
    <>
      <section aria-labelledby="najblizsze-dni">
        <h2 id="najblizsze-dni" className="govuk-heading-m">
          Najbliższe dni
        </h2>
        {shown.length === 0 ? (
          <p className="govuk-body">{NOTHING_SOON}</p>
        ) : (
          <ul className="govuk-list govuk-list--spaced">
            {shown.map((item, i) => {
              const { day, afterWord, date, text, second } = words(item, now);
              return (
                // A fixed order (lib/upcoming.ts ordered), never reordered.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                <li key={i}>
                  <span className="govuk-!-display-block">
                    <strong>
                      <DayWord
                        day={day}
                        form="label"
                        text={date}
                        afterWord={afterWord}
                      />
                    </strong>
                    {/* One text node each: no comments between them. */}
                    {text.map((part, j) =>
                      typeof part === "string" ? (
                        j === 0 ? (
                          ` ${part}`
                        ) : (
                          part
                        )
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence
                        <strong key={j} className={part.tag}>
                          {part.text}
                        </strong>
                      ),
                    )}
                  </span>
                  {second && (
                    <span className="govuk-!-display-block">{second}</span>
                  )}
                  <a className="govuk-link" href={`#${item.module}`}>
                    Szczegóły i źródło
                    <span className="govuk-visually-hidden">
                      {`: ${LINK_NAME[item.module]}`}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
    </>
  );
}
