import { LOCALE } from "./locale.ts";

export const WARSAW = "Europe/Warsaw";

// Making an Intl.DateTimeFormat is slow (locale data), and a schedule page
// formats dozens of dates while it hydrates: each formatter is made once,
// on first use.
let isoDay: Intl.DateTimeFormat | undefined;
let polishDay: Intl.DateTimeFormat | undefined;

function polishDayParts(iso: string) {
  polishDay ??= new Intl.DateTimeFormat(LOCALE, {
    timeZone: WARSAW,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return polishDay.formatToParts(warsawNoon(iso));
}

export function todayInWarsaw(now: Date = new Date()): string {
  isoDay ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: WARSAW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = isoDay.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function warsawNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Absolute label, safe to render on a static page. Example: "poniedziałek, 26 października". */
export function absoluteDay(iso: string): string {
  const { weekday, day, month } = dayFace(iso);
  return `${weekday}, ${day} ${month}`;
}

export type DayFace = {
  day: string;
  month: string;
  weekday: string;
};

/** Visual pieces for the nearest date. Example: "20" and "października, wtorek". */
export function dayFace(iso: string): DayFace {
  const parts = polishDayParts(iso);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    weekday: get("weekday"),
  };
}

export function relativeWord(
  iso: string,
  today: string,
): "dziś" | "jutro" | null {
  if (iso === today) return "dziś";
  if (iso === addDays(today, 1)) return "jutro";
  return null;
}

let offsetName: Intl.DateTimeFormat | undefined;

/** Warsaw's UTC offset at an instant, in minutes (60 or 120). */
function warsawOffset(at: number): number {
  offsetName ??= new Intl.DateTimeFormat("en-US", {
    timeZone: WARSAW,
    timeZoneName: "longOffset",
  });
  const name =
    offsetName.formatToParts(at).find((p) => p.type === "timeZoneName")
      ?.value ?? "";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Warsaw wall time without a zone ("2026-10-25 08:00:00") as ISO 8601 with
 * its offset ("2026-10-25T08:00:00+01:00"); null if it is not a real date
 * and time. In the hour that happens twice (the last Sunday of October,
 * 02:00-02:59) "earlier" takes the first, summer-time one and "later" the
 * second; a time skipped in March moves forward an hour either way.
 */
export function warsawToIso(
  wall: string,
  pick: "earlier" | "later" = "earlier",
): string | null {
  const match = WALL_TIME.exec(wall);
  if (!match) return null;
  const [y, mo, d, h, mi, s = "00"] = match.slice(1);
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (
    new Date(asUtc).toISOString().slice(0, 19) !==
    `${y}-${mo}-${d}T${h}:${mi}:${s}`
  )
    return null;
  const fits = [120, 60].filter(
    (offset) => warsawOffset(asUtc - offset * 60_000) === offset,
  );
  const offset = (pick === "later" ? fits.at(-1) : fits[0]) ?? 60;
  return isoWithOffset(asUtc - offset * 60_000);
}

/** An instant as Warsaw ISO 8601 with its offset. */
export function isoWithOffset(at: number): string {
  const offset = warsawOffset(at);
  const local = new Date(at + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${hh}:${mm}`;
}
