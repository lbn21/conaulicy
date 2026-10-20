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
 * Dataset-wide facts, written by the importer: dataset (year, sources,
 * importedAt, etlCommit). Not shown to visitors.
 */
export const meta = pgTable("meta", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
});

/**
 * One row per source per run of the unattended schedule import
 * (scripts/schedules, docs/import-schedules.md). The GitHub Actions log is the
 * second log; actionsRunUrl links to it.
 */
export const importRuns = pgTable(
  "import_runs",
  {
    id: text().primaryKey(),
    startedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    finishedAt: timestamp({ withTimezone: true, mode: "string" }),
    source: text().notNull(),
    status: text()
      .$type<"no_change" | "applied" | "needs_review" | "failed">()
      .notNull(),
    dryRun: boolean().notNull().default(false),
    /** How files were found: "api" (WordPress REST) or "page" (fallback). */
    detectedVia: text().$type<"api" | "page">(),
    filesSeen: integer().notNull().default(0),
    filesChanged: integer().notNull().default(0),
    eventsAdded: integer().notNull().default(0),
    eventsRemoved: integer().notNull().default(0),
    eventsChanged: integer().notNull().default(0),
    batchId: text(),
    error: text(),
    actionsRunUrl: text(),
  },
  (t) => [
    check(
      "import_runs_status",
      sql`${t.status} in ('no_change', 'applied', 'needs_review', 'failed')`,
    ),
    index().on(t.startedAt),
  ],
);

/**
 * Every source file the import has seen, by content: where it was published,
 * its WordPress media id and date, and where it is archived in S3. The
 * initial archive is also listed in docs/data/sources.md.
 */
export const sourceFiles = pgTable(
  "source_files",
  {
    sha256: text().primaryKey(),
    source: text().notNull(),
    url: text().notNull(),
    mediaId: integer(),
    modifiedGmt: text(),
    /** The events' sourceDoc for this file. */
    doc: text().notNull(),
    s3Key: text(),
    /** Set once a run applied the file or found nothing to change. */
    settledAt: timestamp({ withTimezone: true, mode: "string" }),
    firstSeenAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index().on(t.source, t.mediaId)],
);

/**
 * Watched schedule pages (etl/sources.yaml, watch): the schedule links in
 * their content block and its hash, to notice a new link nobody picked up.
 */
export const sourcePages = pgTable("source_pages", {
  url: text().primaryKey(),
  source: text().notNull(),
  hash: text().notNull(),
  links: jsonb().$type<string[]>().notNull(),
  checkedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
  changedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
});

/**
 * What an applied import batch changed, row by row, so
 * `npm run import:revert -- <batch>` can undo it.
 */
export const importChanges = pgTable(
  "import_changes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    batchId: text().notNull(),
    eventId: text().notNull(),
    op: text().$type<"insert" | "update" | "delete">().notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    check("import_changes_op", sql`${t.op} in ('insert', 'update', 'delete')`),
    index().on(t.batchId),
  ],
);
