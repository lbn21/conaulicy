// Polish public holidays: the waste import's date rules
// (scripts/import/waste/lib.ts) and the made-up dataset's shifted dates
// (lib/dataset-fixture.ts).

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Polish public holidays (days off work), as ISO dates. */
export function polishHolidays(year: number): Set<string> {
  const fixed = [
    "01-01",
    "01-06",
    "05-01",
    "05-03",
    "08-15",
    "11-01",
    "11-11",
    "12-25",
    "12-26",
  ];
  // Christmas Eve is a day off from 2025.
  if (year >= 2025) fixed.push("12-24");
  const days = new Set(fixed.map((md) => `${year}-${md}`));
  const sunday = easter(year);
  days.add(iso(sunday));
  days.add(iso(addDays(sunday, 1))); // Easter Monday
  days.add(iso(addDays(sunday, 49))); // Pentecost
  days.add(iso(addDays(sunday, 60))); // Corpus Christi
  return days;
}
