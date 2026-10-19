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

const FILL: Record<string, string> = {
  zmieszane: "var(--waste-zmieszane)",
  popiol: "var(--waste-popiol)",
  bio: "var(--waste-bio)",
  papier: "var(--waste-papier)",
  tworzywa: "var(--waste-plastik-metale)",
  tworzywa_metale: "var(--waste-plastik-metale)",
  szklo: "var(--waste-szklo)",
  wielkogabarytowe: "var(--waste-gabaryty)",
  elektro: "var(--waste-gabaryty)",
  opony: "var(--waste-gabaryty)",
  tekstylia: "var(--waste-gabaryty)",
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

function WasteMark({ tone }: { tone: string }) {
  const fill = FILL[tone] ?? "var(--secondary)";
  if (tone === "zmieszane") {
    return (
      <svg aria-hidden="true" width="32" height="36" viewBox="0 0 32 36">
        <path fill="var(--waste-zmieszane-border)" d="M13 5h6v3h-6z" />
        <path fill="var(--waste-zmieszane-border)" d="M7 8h18v3H7z" />
        <path
          fill={fill}
          stroke="var(--waste-zmieszane-border)"
          strokeWidth="1"
          d="M9 12h14l-1.1 17.4a2 2 0 0 1-2 1.6h-7.8a2 2 0 0 1-2-1.6L9 12z"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="32" height="36" viewBox="0 0 32 36">
      <path
        fill={fill}
        d="M12 12c.3-3.2 1.7-5.5 4-5.5s3.7 2.3 4 5.5c2.6.4 4.2 1.3 4.2 2.6 0 .9-1.1 1.6-2.8 1.9L20.2 31c-.2 1.3-1.5 2.5-4.2 2.5s-4-1.2-4.2-2.5l-1.2-14.5C8.9 16.2 7.8 15.5 7.8 14.6c0-1.3 1.6-2.2 4.2-2.6z"
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
                <WasteMark key={tone} tone={tone} />
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
