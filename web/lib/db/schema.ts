// The generic "event at a location" model (lib/data-model.ts) as Postgres
// tables. A new feature is a new event type: new rows, not new tables.
// Migrations: `npm run db:generate` after a change here, then `npm run db:migrate`.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { EventType, Locality } from "../data-model.ts";

// Optional house-number range, e.g. only the even numbers 2–40.
const houseNumbers = {
  houseFrom: text(),
  houseTo: text(),
  parity: text().$type<"even" | "odd">(),
};

const parityCheck = (name: string, parity: AnyPgColumn) =>
  check(name, sql`${parity} in ('even', 'odd')`);

export const gminy = pgTable("gminy", {
  id: text().primaryKey(),
  teryt: text().notNull(),
  name: text().notNull(),
  /** The gmina's own schedule page, linked when a place has no zone. */
  scheduleUrl: text(),
});

export const localities = pgTable(
  "localities",
  {
    id: text().primaryKey(),
    gminaId: text()
      .notNull()
      .references(() => gminy.id),
    /** SIMC SYM. */
    teryt: text().notNull(),
    name: text().notNull(),
    kind: text().$type<Locality["kind"]>().notNull(),
    parentId: text().references((): AnyPgColumn => localities.id),
    /** normalize(label), filled by the importer; what /api/search matches. */
    search: text().notNull(),
  },
  (t) => [
    check("localities_kind", sql`${t.kind} in ('miasto', 'wies', 'czesc_wsi')`),
    index().on(t.gminaId),
  ],
);

export const streets = pgTable(
  "streets",
  {
    /** "{locality SYM}-{SYM_UL}", e.g. 0972447-00470; part of the page URL. */
    id: text().primaryKey(),
    localityId: text()
      .notNull()
      .references(() => localities.id),
    /** TERYT SYM_UL. */
    teryt: text(),
    prefix: text().notNull(),
    name: text().notNull(),
    ...houseNumbers,
    search: text().notNull(),
  },
  (t) => [parityCheck("streets_parity", t.parity), index().on(t.localityId)],
);

export const zones = pgTable("zones", {
  /** For example "waste:miasto-s1". */
  id: text().primaryKey(),
  type: text().$type<EventType>().notNull(),
  name: text().notNull(),
});

/** A whole locality (no streetId), a street, or part of a street. */
export const zoneMembers = pgTable(
  "zone_members",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    zoneId: text()
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    localityId: text()
      .notNull()
      .references(() => localities.id),
    streetId: text().references(() => streets.id),
    ...houseNumbers,
  },
  (t) => [
    parityCheck("zone_members_parity", t.parity),
    index().on(t.streetId),
    index().on(t.localityId),
  ],
);

export const events = pgTable(
  "events",
  {
    /** sha256 of zoneId|subtype|start. */
    id: text().primaryKey(),
    type: text().$type<EventType>().notNull(),
    /** Waste fraction, or a later subtype for water, power or weather. */
    subtype: text().notNull(),
    zoneId: text()
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    /** ISO date, or a Warsaw wall-clock date-time ("2026-10-19T08:00"). */
    start: text().notNull(),
    end: text(),
    allDay: boolean().notNull(),
    label: text().notNull(),
    sourceDoc: text().notNull(),
    /** The original as published. No source, no display (CLAUDE.md). */
    sourceUrl: text().notNull(),
    /** Shown next to the source link: "Harmonogram 2026, Miasto Lubaczów, sektor 1". */
    sourceRef: text(),
    sourceSha256: text(),
    /** Day the source was last compared with the original. */
    checkedAt: date({ mode: "string" }).notNull(),
    verified: boolean().notNull().default(false),
    reviewedBy: text(),
    reviewedAt: timestamp({ withTimezone: true, mode: "string" }),
    /** Originally scheduled ISO date when the event was moved (a holiday). */
    shiftedFrom: date({ mode: "string" }),
    /** Type-specific extras. Waste: putOutBy ("06:00"); sourceCell, the cell in the source. */
    payload: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    check(
      "events_start",
      sql`${t.start} ~ '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?$'`,
    ),
    index().on(t.zoneId, t.start),
  ],
);

/**
 * Dataset-wide flags, e.g. testData = true while the seed is loaded, so a
 * real import knows it may replace everything; after an import, dataset
 * (year, sources, importedAt, etlCommit). Not shown to visitors.
 */
export const meta = pgTable("meta", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
});
