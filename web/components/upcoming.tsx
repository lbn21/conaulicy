"use client";

import { useSyncExternalStore } from "react";
import {
  dayLead,
  type Item,
  LINK_NAME,
  trusted,
  visible,
  words,
} from "@/lib/upcoming";

// The address page's relative words (lib/upcoming.ts), as PickupSchedule's
// „dziś”: hydrated with the server's render time, so the HTML has them with
// no pop-in, then the device's clock, re-checked every minute and when the
// tab comes back, so a cached copy or a tab left open past midnight moves
// „Jutro” to „Dziś” and drops what is over. A clock over 5 minutes before
// the render keeps the server's words. Nothing formatted here: the labels
// are the server's.

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** The minute now, so React re-renders at most once a minute. */
const minute = () => Math.floor(Date.now() / 60_000) * 60_000;

function useNow(renderedAt: number): number {
  return trusted(
    useSyncExternalStore(subscribe, minute, () => renderedAt),
    renderedAt,
  );
}

/** The block's lines at `now`; nothing at all when none is shown. */
export function UpcomingList({ items, now }: { items: Item[]; now: number }) {
  const shown = items.filter((item) => visible(item, now));
  if (shown.length === 0) return null;
  return (
    <>
      <section aria-labelledby="najblizsze-dni">
        <h2 id="najblizsze-dni" className="govuk-heading-m">
          Najbliższe dni
        </h2>
        <ul className="govuk-list govuk-list--spaced">
          {shown.map((item, i) => {
            const { lead, text, second } = words(item, now);
            return (
              // A fixed order (lib/upcoming.ts ordered), never reordered.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={i}>
                <span className="govuk-!-display-block">
                  <strong>{lead}</strong>
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
      </section>
      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
    </>
  );
}

/** „Najbliższe dni”: the modules' items, in order (lib/upcoming.ts). */
export function Upcoming({
  items,
  renderedAt,
}: {
  items: Item[];
  /** When the server rendered the page (ms). */
  renderedAt: number;
}) {
  return <UpcomingList items={items} now={useNow(renderedAt)} />;
}

/** A section's first line: „Jutro: piątek, 30 października”. */
export function DayLead({
  day,
  text,
  renderedAt,
}: {
  day: string;
  text: string;
  renderedAt: number;
}) {
  return dayLead(day, text, useNow(renderedAt));
}
