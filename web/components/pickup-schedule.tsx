"use client";

import { useSyncExternalStore } from "react";
import { absoluteDay, dayFace, relativeWord, todayInWarsaw } from "@/lib/dates";

type Pickup = {
  id: string;
  subtype: string;
  label: string;
  putOutBy: string | null;
};

export type PickupDay = { date: string; pickups: Pickup[] };

const HERO_COUNT = 3;

const TOKEN: Record<string, string> = {
  zmieszane: "zmieszane",
  popiol: "popiol",
  bio: "bio",
  papier: "papier",
  tworzywa: "plastik-metale",
  tworzywa_metale: "plastik-metale",
  szklo: "szklo",
  wielkogabarytowe: "gabaryty",
  elektro: "gabaryty",
  opony: "gabaryty",
  tekstylia: "gabaryty",
};

function subscribe(): () => void {
  return () => {};
}

function tones(subtype: string): string[] {
  if (subtype === "zmieszane_i_bio") return ["zmieszane", "bio"];
  return [subtype];
}

function hour(time: string): string {
  return time.replace(/^0/, "");
}

function spokenDay(iso: string, today: string | null): string {
  const absolute = absoluteDay(iso);
  const relative = today ? relativeWord(iso, today) : null;
  return relative ? `${relative}, ${absolute}` : absolute;
}

function shade(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, black)`;
}

function WasteMark({ tone, large }: { tone: string; large: boolean }) {
  const token = TOKEN[tone];
  const fill = token ? `var(--waste-${token})` : "var(--secondary)";
  const outline =
    token === "zmieszane" ? "var(--waste-zmieszane-border)" : "none";
  const [width, height] = large ? [28, 40] : [20, 28];
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox="0 0 28 40"
      className="shrink-0"
      stroke={outline}
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      <rect
        x="1.5"
        y="6"
        width="7"
        height="3"
        rx="1.5"
        fill={shade(fill, 60)}
      />
      <path
        fill={fill}
        d="M5.5 12h19l-2.3 22.3a2 2 0 0 1-2 1.7H8.6a2 2 0 0 1-2-1.7z"
      />
      <path
        fill={shade(fill, 78)}
        stroke="none"
        d="M5.7 13.5h18.6l.2-1.5h-19z"
      />
      <path
        fill={shade(fill, 82)}
        d="M4 9.5A2.5 2.5 0 0 1 6.5 7h17A2.5 2.5 0 0 1 26 9.5V12H4z"
      />
      <rect
        x="17"
        y="35"
        width="4"
        height="3.5"
        rx="1"
        fill={shade(fill, 60)}
      />
      <circle cx="9" cy="34.5" r="4.5" fill={shade(fill, 45)} />
      <circle cx="9" cy="34.5" r="1.6" fill={fill} stroke="none" />
    </svg>
  );
}

function DayBlock({
  day,
  today,
  prominent,
}: {
  day: PickupDay;
  today: string | null;
  prominent: boolean;
}) {
  const relative = today ? relativeWord(day.date, today) : null;
  const face = dayFace(day.date);
  const putOutBy = day.pickups.find((p) => p.putOutBy)?.putOutBy;
  const Heading = prominent || today === null ? "h2" : "h3";
  return (
    <li
      className={
        prominent
          ? "pickup-hero border-l-4 border-accent py-4 pl-4"
          : "border-t border-border py-4"
      }
    >
      <Heading className={prominent ? "font-bold" : "text-xl font-bold"}>
        <time dateTime={day.date}>
          {prominent ? (
            <>
              <span className="sr-only">{spokenDay(day.date, today)}</span>
              <span aria-hidden="true" className="flex flex-col gap-1">
                {relative && (
                  <span className="text-xl font-bold text-accent">
                    {relative}
                  </span>
                )}
                <span className="text-[4.5rem] leading-none tracking-tight">
                  {face.day}
                </span>
                <span className="text-lg font-bold">
                  {face.monthShort}, {face.weekday}
                </span>
              </span>
            </>
          ) : (
            spokenDay(day.date, today)
          )}
        </time>
      </Heading>
      {putOutBy && (
        <p className="mt-2 text-text-muted">
          Wystaw przed posesję do godziny {hour(putOutBy)}.
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-3">
        {day.pickups.map((pickup) => (
          <li key={pickup.id} className="flex items-center gap-3">
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

export function PickupSchedule({ days }: { days: PickupDay[] }) {
  const today = useSyncExternalStore<string | null>(
    subscribe,
    todayInWarsaw,
    () => null,
  );
  const visible = today ? days.filter((day) => day.date >= today) : days;

  if (visible.length === 0) {
    return (
      <p className="mt-8 max-w-prose">
        Nie mamy jeszcze kolejnych terminów. Dopiszemy je, gdy pojawi się nowy
        harmonogram.
      </p>
    );
  }

  const hero = today ? visible.slice(0, HERO_COUNT) : [];
  const rest = today ? visible.slice(HERO_COUNT) : visible;

  return (
    <div className="mt-8">
      {hero.length > 0 && (
        <ol aria-label="Najbliższe odbiory" className="flex flex-col gap-4">
          {hero.map((day, index) => (
            <DayBlock
              key={day.date}
              day={day}
              today={today}
              prominent={index === 0}
            />
          ))}
        </ol>
      )}
      {rest.length > 0 && (
        <details
          className="more-dates mt-4 border-t border-border"
          open={!today}
        >
          <summary>Pokaż więcej terminów</summary>
          <ol className={hero.length > 0 ? undefined : "list-none"}>
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
