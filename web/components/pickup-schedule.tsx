"use client";

import { ChevronDown } from "lucide-react";
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
      className="shrink-0"
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

function DayBlock({
  day,
  today,
  prominent,
}: {
  day: PickupDay;
  today: string;
  prominent: boolean;
}) {
  const relative = relativeWord(day.date, today);
  const face = dayFace(day.date);
  const putOutBy = day.pickups.find((p) => p.putOutBy)?.putOutBy;
  return (
    <li
      className={
        prominent
          ? "border-l-4 border-accent py-4 pl-4"
          : "border-t border-border py-4"
      }
    >
      <h3
        className={
          prominent
            ? "govuk-heading-s govuk-!-margin-bottom-0"
            : "govuk-heading-m govuk-!-margin-bottom-0"
        }
      >
        <time dateTime={day.date}>
          {prominent ? (
            <>
              <span className="govuk-visually-hidden">
                {spokenDay(day.date, today)}
              </span>
              <span aria-hidden="true" className="flex flex-col gap-1">
                <span
                  className={
                    relative
                      ? "govuk-!-font-size-27 govuk-!-font-weight-bold text-accent"
                      : "govuk-!-font-size-27 govuk-!-font-weight-bold text-text-muted"
                  }
                >
                  {relative ?? "Najbliższy odbiór"}
                </span>
                <span className="govuk-!-font-size-80">{face.day}</span>
                <span className="govuk-!-font-size-24 govuk-!-font-weight-bold">
                  {face.month}, {face.weekday}
                </span>
              </span>
            </>
          ) : (
            spokenDay(day.date, today)
          )}
        </time>
      </h3>
      {putOutBy && (
        <p className="govuk-body govuk-!-margin-top-2 govuk-!-margin-bottom-0">
          Wystaw przed posesję do godziny {hour(putOutBy)}.
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-3">
        {day.pickups.map((pickup) => (
          <li key={pickup.id} className="flex min-h-12 items-center gap-3">
            <span aria-hidden="true" className="flex gap-1">
              {tones(pickup.subtype).map((tone) => (
                <WasteMark key={tone} tone={tone} large={prominent} />
              ))}
            </span>
            <span>{pickup.label}</span>
          </li>
        ))}
      </ul>
    </li>
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
    <div className="mt-8">
      <h2 id="pickups-heading" className="govuk-visually-hidden">
        Najbliższe odbiory
      </h2>
      <ol aria-labelledby="pickups-heading" className="flex flex-col gap-4">
        {hero.map((day, index) => (
          <DayBlock
            key={day.date}
            day={day}
            today={today}
            prominent={index === 0}
          />
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="more-dates mt-4 border-t border-border">
          <summary>
            <ChevronDown
              aria-hidden="true"
              size={24}
              className="more-chevron"
            />
            <span className="more-closed">Pokaż więcej terminów</span>
            <span className="more-open">Zwiń terminy</span>
          </summary>
          <ol>
            {rest.map((day) => (
              <DayBlock
                key={day.date}
                day={day}
                today={today}
                prominent={false}
              />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
