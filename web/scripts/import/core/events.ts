// Events in the database against a new import: the diff a batch applies, and
// the dead-man switch's coverage check. No network, no database.

// ------------------------------------------------------------------ diff

export type EventRow = Record<string, unknown> & { id: string };

/** Columns compared between the database and a new import. */
export const EVENT_COLUMNS = [
  "type",
  "subtype",
  "zoneId",
  "start",
  "end",
  "allDay",
  "label",
  "sourceDoc",
  "sourceUrl",
  "sourceRef",
  "sourceSha256",
  "checkedAt",
  "verified",
  "reviewedBy",
  "shiftedFrom",
  "payload",
] as const;

const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  ) ?? "null";

export function diffEvents(current: EventRow[], next: EventRow[]) {
  const before = new Map(current.map((r) => [r.id, r]));
  const after = new Map(next.map((r) => [r.id, r]));
  const added = next.filter((r) => !before.has(r.id));
  const removed = current.filter((r) => !after.has(r.id));
  const changed: Array<{
    before: EventRow;
    after: EventRow;
    columns: string[];
  }> = [];
  for (const row of next) {
    const old = before.get(row.id);
    if (!old) continue;
    const columns = EVENT_COLUMNS.filter(
      (c) => stable(old[c] ?? null) !== stable(row[c] ?? null),
    );
    if (columns.length) changed.push({ before: old, after: row, columns });
  }
  return { added, removed, changed };
}

// ------------------------------------------------------------------ coverage

/**
 * Zones whose last date is closer than minDays (or that have none): the next
 * schedule is late. The dead-man switch's single issue lists them.
 */
export function coverageGaps(
  lastDates: Array<{ zoneId: string; last: string | null }>,
  today: string,
  minDays: number,
): string[] {
  const limit = new Date(`${today}T12:00:00Z`).getTime() + minDays * 86_400_000;
  return lastDates
    .filter((z) => !z.last || new Date(`${z.last}T12:00:00Z`).getTime() < limit)
    .map((z) => `${z.zoneId}: ${z.last ? `last date ${z.last}` : "no dates"}`);
}
