const WARSAW = "Europe/Warsaw";

export function todayInWarsaw(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WARSAW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
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

function warsawNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Absolute label, safe to render on a static page. Example: "poniedziałek, 26 października". */
export function absoluteDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: WARSAW,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(warsawNoon(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")}`;
}

export type DayFace = {
  day: string;
  month: string;
  weekday: string;
};

/** Visual pieces for the nearest date. Example: "20" and "października, wtorek". */
export function dayFace(iso: string): DayFace {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: WARSAW,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(warsawNoon(iso));
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
