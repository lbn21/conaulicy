// Writing events for the unattended import and its revert: every change is
// applied and logged in import_changes under its batch id, in the caller's
// transaction.
import type pg from "pg";
import type { EventRow } from "./events.ts";

/** events columns: [row key, column]. */
export const EVENT_FIELDS: Array<[string, string]> = [
  ["id", "id"],
  ["type", "type"],
  ["subtype", "subtype"],
  ["zoneId", "zone_id"],
  ["start", "start"],
  ["end", "end"],
  ["allDay", "all_day"],
  ["label", "label"],
  ["sourceDoc", "source_doc"],
  ["sourceUrl", "source_url"],
  ["sourceRef", "source_ref"],
  ["sourceSha256", "source_sha256"],
  ["checkedAt", "checked_at"],
  ["verified", "verified"],
  ["reviewedBy", "reviewed_by"],
  ["reviewedAt", "reviewed_at"],
  ["shiftedFrom", "shifted_from"],
  ["payload", "payload"],
];

const columns = EVENT_FIELDS.map(([, c]) => `"${c}"`).join(", ");

/** Events of one zone from..to (ISO dates), as rows comparable with transform()'s. */
export async function scopeEvents(
  db: pg.Client,
  zoneId: string,
  scope: { from: string; to: string },
): Promise<EventRow[]> {
  const { rows } = await db.query(
    `select ${columns}, to_char(checked_at, 'YYYY-MM-DD') as checked_at,
       to_char(shifted_from, 'YYYY-MM-DD') as shifted_from
     from events where zone_id = $1 and start >= $2 and start <= $3`,
    [zoneId, scope.from, `${scope.to}T99`],
  );
  return rows.map(
    (r) =>
      Object.fromEntries(
        EVENT_FIELDS.map(([k, c]) => [k, r[c] ?? null]),
      ) as EventRow,
  );
}

const values = (row: EventRow) =>
  EVENT_FIELDS.map(([k]) =>
    k === "payload" && row[k] ? JSON.stringify(row[k]) : (row[k] ?? null),
  );

export type Op = "insert" | "update" | "delete";

/** Applies one change to events and logs it under the batch. */
export async function writeChange(
  db: pg.Client,
  batchId: string,
  op: Op,
  before: EventRow | null,
  after: EventRow | null,
) {
  const id = (after ?? before)?.id;
  if (op === "insert" && after) {
    await db.query(
      `insert into events (${columns}) values (${EVENT_FIELDS.map((_, i) => `$${i + 1}`).join(", ")})`,
      values(after),
    );
  } else if (op === "update" && after) {
    const sets = EVENT_FIELDS.slice(1)
      .map(([, c], i) => `"${c}" = $${i + 2}`)
      .join(", ");
    await db.query(`update events set ${sets} where id = $1`, values(after));
  } else if (op === "delete") {
    await db.query("delete from events where id = $1", [id]);
  }
  await db.query(
    "insert into import_changes (batch_id, event_id, op, before, after) values ($1, $2, $3, $4, $5)",
    [
      batchId,
      id,
      op,
      before && JSON.stringify(before),
      after && JSON.stringify(after),
    ],
  );
}
