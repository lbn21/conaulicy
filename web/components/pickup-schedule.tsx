"use client";

import { useSyncExternalStore } from "react";
import { absoluteDay, relativeWord, todayInWarsaw } from "@/lib/dates";

type Pickup = {
  id: string;
  subtype: string;
  label: string;
  putOutBy: string | null;
};

export type PickupDay = { date: string; pickups: Pickup[] };

const HERO_COUNT = 3;

const TONE: Record<string, string> = {
  zmieszane: "border border-waste-zmieszane-border bg-waste-zmieszane",
  popiol: "bg-waste-popiol",
  bio: "bg-waste-bio",
  papier: "bg-waste-papier",
  tworzywa: "bg-waste-plastik-metale",
  tworzywa_metale: "bg-waste-plastik-metale",
  szklo: "bg-waste-szklo",
  wielkogabarytowe: "bg-waste-gabaryty",
  elektro: "bg-waste-gabaryty",
  opony: "bg-waste-gabaryty",
  tekstylia: "bg-waste-gabaryty",
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
      <Heading
        className={
          prominent ? "text-2xl font-bold md:text-3xl" : "text-xl font-bold"
        }
      >
        <time dateTime={day.date} className="flex flex-col gap-1">
          {relative && <span className="text-accent">{relative}</span>}
          <span className={relative ? "text-lg font-bold" : undefined}>
            {absoluteDay(day.date)}
          </span>
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
                <span
                  key={tone}
                  className={`size-6 shrink-0 rounded-sm ${TONE[tone] ?? "border-2 border-border bg-secondary"}`}
                />
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
          {hero.map((day) => (
            <DayBlock key={day.date} day={day} today={today} prominent />
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
