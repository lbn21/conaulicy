"use client";

import type { LucideIcon } from "lucide-react";
import {
  Car,
  Flame,
  Leaf,
  Milk,
  Newspaper,
  Plug,
  Shirt,
  Sofa,
  Trash2,
  Wine,
} from "lucide-react";
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

type Fraction = { icon: LucideIcon; token: string };

const FRACTION: Record<string, Fraction> = {
  zmieszane: { icon: Trash2, token: "zmieszane" },
  popiol: { icon: Flame, token: "popiol" },
  bio: { icon: Leaf, token: "bio" },
  papier: { icon: Newspaper, token: "papier" },
  tworzywa: { icon: Milk, token: "plastik-metale" },
  tworzywa_metale: { icon: Milk, token: "plastik-metale" },
  szklo: { icon: Wine, token: "szklo" },
  wielkogabarytowe: { icon: Sofa, token: "gabaryty" },
  elektro: { icon: Plug, token: "gabaryty" },
  opony: { icon: Car, token: "gabaryty" },
  tekstylia: { icon: Shirt, token: "gabaryty" },
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

function WasteMark({ tone, large }: { tone: string; large: boolean }) {
  const fraction = FRACTION[tone] ?? { icon: Trash2, token: "zmieszane" };
  const Icon = fraction.icon;
  const fill = `var(--waste-${fraction.token})`;
  const border =
    fraction.token === "zmieszane" ? "var(--waste-zmieszane-border)" : fill;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border ${large ? "size-12" : "size-10"}`}
      style={{
        backgroundColor: fill,
        borderColor: border,
        color: `var(--waste-${fraction.token}-fg)`,
      }}
    >
      <Icon aria-hidden="true" size={large ? 32 : 24} />
    </span>
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
