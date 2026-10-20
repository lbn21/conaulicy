"use client";

import { useSyncExternalStore } from "react";
import { absoluteDay, dayFace, relativeWord, todayInWarsaw } from "@/lib/dates";
import {
  BIN,
  BIN_HEIGHT,
  BIN_WIDTH,
  OUTLINED,
  TOKEN,
  tones,
} from "@/lib/waste-bin";

type Pickup = {
  id: string;
  subtype: string;
  label: string;
  putOutBy: string | null;
};

export type PickupDay = { date: string; pickups: Pickup[] };

const HERO_COUNT = 3;

// Re-check the Warsaw day every minute and when the tab comes back, so a tab
// left open overnight moves "jutro" to "dziś". React only re-renders when the
// date string changes.
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

function hour(time: string): string {
  return time.replace(/^0/, "");
}

function spokenDay(iso: string, today: string): string {
  const absolute = absoluteDay(iso);
  const relative = relativeWord(iso, today);
  return relative ? `${relative}, ${absolute}` : absolute;
}

function shade(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, black)`;
}

function rectOf(r: {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}) {
  return { x: r.x, y: r.y, width: r.width, height: r.height, rx: r.rx };
}

function WasteMark({ tone, large }: { tone: string; large: boolean }) {
  const token = TOKEN[tone];
  const fill = token ? `var(--waste-${token})` : "var(--secondary)";
  const outline =
    token && OUTLINED.has(token) ? `var(--waste-${token}-border)` : "none";
  const [width, height] = large ? [34, 48] : [28, 40];
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${BIN_WIDTH} ${BIN_HEIGHT}`}
      className="app-bin"
      stroke={outline}
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      <rect {...rectOf(BIN.handle)} fill={shade(fill, BIN.handle.shade)} />
      <path fill={fill} d={BIN.body} />
      <path fill={shade(fill, BIN.rim.shade)} stroke="none" d={BIN.rim.d} />
      <path fill={shade(fill, BIN.lid.shade)} d={BIN.lid.d} />
      <rect {...rectOf(BIN.foot)} fill={shade(fill, BIN.foot.shade)} />
      <circle
        cx={BIN.wheel.cx}
        cy={BIN.wheel.cy}
        r={BIN.wheel.r}
        fill={shade(fill, BIN.wheel.shade)}
      />
      <circle
        cx={BIN.hub.cx}
        cy={BIN.hub.cy}
        r={BIN.hub.r}
        fill={fill}
        stroke="none"
      />
    </svg>
  );
}

function Bins({ day, large }: { day: PickupDay; large: boolean }) {
  return (
    <ul className="govuk-list govuk-!-margin-bottom-0">
      {day.pickups.map((pickup) => (
        <li key={pickup.id}>
          <span aria-hidden="true">
            {tones(pickup.subtype).map((tone) => (
              <WasteMark key={tone} tone={tone} large={large} />
            ))}
          </span>
          {pickup.label}
        </li>
      ))}
    </ul>
  );
}

function PutOutBy({ day }: { day: PickupDay }) {
  const putOutBy = day.pickups.find((p) => p.putOutBy)?.putOutBy;
  if (!putOutBy) return null;
  return (
    <p className="govuk-body govuk-!-margin-top-2 govuk-!-margin-bottom-0">
      Wystaw przed posesję do godziny {hour(putOutBy)}.
    </p>
  );
}

/** The next pickup, set apart as GOV.UK inset text, with the big date. */
function NextPickup({ day, today }: { day: PickupDay; today: string }) {
  const relative = relativeWord(day.date, today);
  const face = dayFace(day.date);
  return (
    <div className="govuk-inset-text">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
        <time dateTime={day.date}>
          <span className="govuk-visually-hidden">
            {spokenDay(day.date, today)}
          </span>
          <span aria-hidden="true">
            <span className="govuk-!-display-block govuk-!-font-size-27">
              {relative ?? "Najbliższy odbiór"}
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-80">
              {face.day}
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-24">
              {face.month}, {face.weekday}
            </span>
          </span>
        </time>
      </h3>
      <Bins day={day} large />
      <PutOutBy day={day} />
    </div>
  );
}

/** Further pickups: GOV.UK summary list, the date as key, bins as value. */
function DayList({ days, today }: { days: PickupDay[]; today: string }) {
  return (
    <dl className="govuk-summary-list">
      {days.map((day) => (
        <div key={day.date} className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">
            <time dateTime={day.date}>{spokenDay(day.date, today)}</time>
          </dt>
          <dd className="govuk-summary-list__value">
            <Bins day={day} large={false} />
            <PutOutBy day={day} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PickupSchedule({
  days,
  renderedOn,
}: {
  days: PickupDay[];
  /** Warsaw day the server rendered for. */
  renderedOn: string;
}) {
  // Hydrates with the server's day, so "dziś"/"jutro" is in the HTML with no
  // pop-in. Re-renders only if the Warsaw day has moved on since the render
  // (a cached page across midnight).
  const today = useSyncExternalStore(
    subscribe,
    todayInWarsaw,
    () => renderedOn,
  );
  const visible = days.filter((day) => day.date >= today);

  if (visible.length === 0) {
    return (
      <p className="govuk-body">
        Nie mamy jeszcze kolejnych terminów. Dopiszemy je, gdy pojawi się nowy
        harmonogram.
      </p>
    );
  }

  const hero = visible.slice(0, HERO_COUNT);
  const rest = visible.slice(HERO_COUNT);

  return (
    <section aria-labelledby="pickups-heading">
      <h2 id="pickups-heading" className="govuk-visually-hidden">
        Najbliższe odbiory
      </h2>
      <NextPickup day={hero[0]} today={today} />
      {hero.length > 1 && <DayList days={hero.slice(1)} today={today} />}
      {rest.length > 0 && (
        <details className="govuk-details">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Pokaż więcej terminów
            </span>
          </summary>
          <div className="govuk-details__text">
            <DayList days={rest} today={today} />
          </div>
        </details>
      )}
    </section>
  );
}
