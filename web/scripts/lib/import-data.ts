// The ETL output (etl/out/*.json) turned into database rows, without touching
// the network or the database: validation, ids, labels, sources, approvals.
// docs/import-plan.md section 2. Used by scripts/import.ts; tested on its own.
import { createHash } from "node:crypto";
import type { EventType } from "../../lib/data-model.ts";
import type {
  events,
  gminy,
  localities,
  streets,
  zoneMembers,
  zones,
} from "../../lib/db/schema.ts";
import { normalize } from "../../lib/normalize.ts";
import {
  localitySearchLabel,
  streetLabel,
  terytName,
} from "../../lib/places.ts";
import { GMINA_SCHEDULE_PAGES } from "./gmina-pages.ts";
import { type UlicRow, ulicName } from "./teryt.ts";

type EtlSource = {
  doc: string;
  kind: string;
  url: string;
  sha256: string;
  published_at?: string;
};

export type Etl = {
  gminy: Array<{ id: string; teryt: string; name: string }>;
  localities: Array<{
    id: string;
    gminaId: string;
    teryt: string;
    name: string;
    kind: "miasto" | "wies" | "czesc_wsi";
    parentId?: string | null;
  }>;
  streets: Array<{
    id: string;
    localityId: string;
    teryt: string | null;
    /** TERYT CECHA. */
    prefix: string;
    /** Used only while nazwa1 is missing (an ETL output before TERYT fields). */
    name: string;
    /** TERYT NAZWA_1 and NAZWA_2: the name is built from them. */
    nazwa1?: string | null;
    nazwa2?: string | null;
  }>;
  zones: Array<{
    id: string;
    type: EventType;
    name: string;
    members: Array<{ localityId: string; streetId?: string | null }>;
  }>;
  events: Array<{
    id: string;
    type: EventType;
    subtype: string;
    zoneId: string;
    start: string;
    allDay: boolean;
    label: string;
    source: { doc: string; url: string; ref?: string; sha256?: string };
  }>;
  meta: {
    year: number;
    provisional?: boolean;
    flags?: string[];
    sources: EtlSource[];
  };
};

export type Approval = {
  zone_id: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  events_sha256?: string | null;
};

export type Rows = {
  gminy: Array<typeof gminy.$inferInsert>;
  localities: Array<typeof localities.$inferInsert>;
  streets: Array<typeof streets.$inferInsert>;
  zones: Array<typeof zones.$inferInsert>;
  zoneMembers: Array<Omit<typeof zoneMembers.$inferInsert, "id">>;
  events: Array<typeof events.$inferInsert>;
};

/**
 * Every street's CECHA, NAZWA_1 and NAZWA_2 from the official ULIC rows, by
 * its locality's SIMC and its SYM_UL: TERYT is the one source of street
 * names and types (CLAUDE.md). A street missing from ULIC is an error; a
 * name the ETL spelled differently is a warning (TERYT's wins).
 */
export function withTeryt(
  etl: Etl,
  ulic: UlicRow[],
): { etl: Etl; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(ulic.map((r) => [`${r.simc}-${r.symUl}`, r]));
  const streets = etl.streets.map((s) => {
    const row = byId.get(`${stripPrefix(s.localityId)}-${s.teryt}`);
    if (!row) {
      errors.push(`streets: ${s.id} (SYM_UL ${s.teryt}) is not in TERYT ULIC`);
      return s;
    }
    if (s.prefix !== row.cecha || s.name !== ulicName(row)) {
      warnings.push(
        `streets: ${s.id} "${s.prefix} ${s.name}" is "${row.cecha} ${ulicName(row)}" in TERYT; TERYT's used`,
      );
    }
    return { ...s, prefix: row.cecha, nazwa1: row.nazwa1, nazwa2: row.nazwa2 };
  });
  return { etl: { ...etl, streets }, errors, warnings };
}

/** The name a street shows: from its TERYT fields, else the ETL's name. */
const etlStreetName = (s: Etl["streets"][number]) =>
  s.nazwa1 ? terytName(s.nazwa1, s.nazwa2 ?? null) : s.name;

/** "simc-0972447" → "0972447", "ulic-0972447-00470" → "0972447-00470". */
export function stripPrefix(id: string): string {
  return id.replace(/^(simc|ulic)-/, "");
}

export function eventId(zoneId: string, subtype: string, start: string) {
  return createHash("sha256")
    .update(`${zoneId}|${subtype}|${start}`)
    .digest("hex");
}

/** What an approval in approvals.yaml must quote: the zone's events as reviewed. */
export function eventsSha256(ids: string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join("\n"))
    .digest("hex");
}

const START = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/** Every problem that makes the dataset unsafe to load; empty when fine. */
export function validate(etl: Etl): string[] {
  const errors: string[] = [];
  const ids = (name: string, rows: Array<{ id: string }>) => {
    const seen = new Set<string>();
    for (const { id } of rows) {
      if (seen.has(id)) errors.push(`${name}: duplicate id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const gminaIds = ids("gminy", etl.gminy);
  const localityIds = ids("localities", etl.localities);
  const streetIds = ids("streets", etl.streets);
  const zoneIds = ids("zones", etl.zones);
  ids("events", etl.events);
  const streetLocality = new Map(etl.streets.map((s) => [s.id, s.localityId]));
  const sourceDocs = new Map(etl.meta.sources.map((s) => [s.doc, s]));

  for (const l of etl.localities) {
    if (!gminaIds.has(l.gminaId))
      errors.push(`localities: ${l.id} has unknown gmina ${l.gminaId}`);
    if (l.parentId && !localityIds.has(l.parentId))
      errors.push(`localities: ${l.id} has unknown parent ${l.parentId}`);
  }
  for (const s of etl.streets) {
    if (!localityIds.has(s.localityId))
      errors.push(`streets: ${s.id} has unknown locality ${s.localityId}`);
  }
  for (const z of etl.zones) {
    for (const m of z.members) {
      if (!localityIds.has(m.localityId))
        errors.push(
          `zones: ${z.id} member has unknown locality ${m.localityId}`,
        );
      if (m.streetId && !streetIds.has(m.streetId))
        errors.push(`zones: ${z.id} member has unknown street ${m.streetId}`);
      else if (m.streetId && streetLocality.get(m.streetId) !== m.localityId)
        errors.push(
          `zones: ${z.id} street ${m.streetId} is not in ${m.localityId}`,
        );
    }
  }
  for (const e of etl.events) {
    if (!zoneIds.has(e.zoneId))
      errors.push(`events: ${e.id} has unknown zone ${e.zoneId}`);
    if (!START.test(e.start))
      errors.push(`events: ${e.id} has a bad start ${e.start}`);
    if (e.id !== eventId(e.zoneId, e.subtype, e.start))
      errors.push(`events: ${e.id} is not sha256(zoneId|subtype|start)`);
    const source = sourceDocs.get(e.source?.doc);
    if (!e.source?.url) errors.push(`events: ${e.id} has no source url`);
    else if (!source)
      errors.push(`events: ${e.id} cites ${e.source.doc}, not in meta.sources`);
    else if (source.url !== e.source.url)
      errors.push(`events: ${e.id} source url differs from meta.sources`);
  }
  return errors;
}

/**
 * Database rows. checkedAt maps each source doc to the day its file was last
 * compared with the original; approvals by zone id.
 */
export function transform(
  etl: Etl,
  checkedAt: Map<string, string>,
  approvals: Map<string, Approval> = new Map(),
): { rows: Rows; zoneHashes: Map<string, string>; warnings: string[] } {
  const warnings: string[] = [];
  const gminaName = new Map(etl.gminy.map((g) => [g.id, g.name]));
  const localityName = new Map(etl.localities.map((l) => [l.id, l.name]));
  const zoneName = new Map(etl.zones.map((z) => [z.id, z.name]));

  // Parents before their parts: localities.parent_id is a foreign key.
  const localityRows = [...etl.localities]
    .sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)))
    .map((l) => ({
      id: stripPrefix(l.id),
      gminaId: l.gminaId,
      teryt: l.teryt,
      name: l.name,
      kind: l.kind,
      parentId: l.parentId ? stripPrefix(l.parentId) : null,
      search: normalize(
        localitySearchLabel({
          name: l.name,
          kind: l.kind,
          parent: l.parentId ? (localityName.get(l.parentId) ?? null) : null,
          gmina: gminaName.get(l.gminaId) ?? "",
        }),
      ),
    }));

  const zoneHashes = new Map<string, string>();
  for (const z of etl.zones) {
    zoneHashes.set(
      z.id,
      eventsSha256(
        etl.events.filter((e) => e.zoneId === z.id).map((e) => e.id),
      ),
    );
  }
  const review = new Map<string, { by: string; at: string | null }>();
  for (const [zoneId, a] of approvals) {
    if (!a.reviewed_by) continue;
    if (a.events_sha256 && a.events_sha256 === zoneHashes.get(zoneId)) {
      review.set(zoneId, { by: a.reviewed_by, at: a.reviewed_at ?? null });
    } else {
      warnings.push(
        `${zoneId}: approved by ${a.reviewed_by}, but events_sha256 ${a.events_sha256 ? "does not match" : "is missing"}; left unverified.`,
      );
    }
  }

  const rows: Rows = {
    gminy: etl.gminy.map((g) => ({
      id: g.id,
      teryt: g.teryt,
      name: g.name,
      scheduleUrl: GMINA_SCHEDULE_PAGES[g.teryt] ?? null,
    })),
    localities: localityRows,
    streets: etl.streets.map((s) => ({
      id: stripPrefix(s.id),
      localityId: stripPrefix(s.localityId),
      teryt: s.teryt,
      prefix: s.prefix,
      name: etlStreetName(s),
      nazwa1: s.nazwa1 ?? null,
      nazwa2: s.nazwa2 ?? null,
      houseFrom: null,
      houseTo: null,
      parity: null,
      search: normalize(
        streetLabel({
          prefix: s.prefix,
          name: etlStreetName(s),
          locality: localityName.get(s.localityId) ?? "",
        }),
      ),
    })),
    zones: etl.zones.map((z) => ({ id: z.id, type: z.type, name: z.name })),
    zoneMembers: etl.zones.flatMap((z) =>
      z.members.map((m) => ({
        zoneId: z.id,
        localityId: stripPrefix(m.localityId),
        streetId: m.streetId ? stripPrefix(m.streetId) : null,
        houseFrom: null,
        houseTo: null,
        parity: null,
      })),
    ),
    events: etl.events.map((e) => {
      const reviewed = review.get(e.zoneId);
      const payload: Record<string, unknown> = {};
      // Every gmina PDF: "wystawić przed posesję w dniu wywozu do godz. 6:00".
      // The city schedule says nothing like it.
      if (e.zoneId.startsWith("waste:gmina-")) payload.putOutBy = "06:00";
      if (e.source.ref) payload.sourceCell = e.source.ref;
      return {
        id: e.id,
        type: e.type,
        subtype: e.subtype,
        zoneId: e.zoneId,
        start: e.start,
        end: null,
        allDay: e.allDay,
        label: e.label,
        sourceDoc: e.source.doc,
        sourceUrl: e.source.url,
        // Shown next to the source link; the cell stays in payload for audit.
        sourceRef: `Harmonogram ${etl.meta.year}, ${zoneName.get(e.zoneId)}`,
        sourceSha256: e.source.sha256 ?? null,
        checkedAt: checkedAt.get(e.source.doc) ?? "",
        verified: Boolean(reviewed),
        reviewedBy: reviewed?.by ?? null,
        reviewedAt: reviewed?.at ?? null,
        // Published dates are shown as published; nothing is marked as moved.
        shiftedFrom: null,
        payload: Object.keys(payload).length > 0 ? payload : null,
      };
    }),
  };
  return { rows, zoneHashes, warnings };
}

/** The Neon endpoint id ("ep-…") of a host, the only part safe to print. */
function neonEndpoint(host: string | undefined): string | null {
  if (!host?.endsWith(".neon.tech")) return null;
  return host.split(".")[0].replace(/-pooler$/, "");
}

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Where a connection string points, printable, and whether it is the
 * production database. Production is Neon `main`, the branch the Vercel–Neon
 * integration is connected to; its variables (PGHOST, POSTGRES_URL) reach
 * only Production and Development, while Preview gets plain DATABASE_URL*
 * for the `preview` branch (docs/database.md). So: a Neon target whose
 * endpoint equals the integration's endpoint, or any target when
 * VERCEL_ENV / VERCEL_TARGET_ENV says production, counts as production.
 */
export function describeTarget(
  url: string,
  env: Record<string, string | undefined>,
): { label: string; production: boolean } {
  const host = hostOf(url);
  const endpoint = neonEndpoint(host);
  const integration =
    neonEndpoint(env.PGHOST) ??
    neonEndpoint(env.POSTGRES_HOST) ??
    neonEndpoint(hostOf(env.POSTGRES_URL));
  const production =
    env.VERCEL_ENV === "production" ||
    env.VERCEL_TARGET_ENV === "production" ||
    (endpoint !== null && endpoint === integration);
  const local = host === "localhost" || host === "127.0.0.1";
  const label = endpoint
    ? `Neon endpoint ${endpoint} (host masked)`
    : local
      ? `local Postgres (${host})`
      : "Postgres at a non-Neon host (masked)";
  return { label, production };
}

/** A CLI's error: the message on stderr, exit 1. */
export function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

/**
 * Says which database a CLI writes to and in which mode, and stops before
 * writing to production without --yes-production.
 */
export function guardTarget(
  url: string,
  args: { apply: boolean; "yes-production": boolean },
): void {
  const target = describeTarget(url, process.env);
  console.log(
    `Target: ${target.label}${target.production ? ", PRODUCTION" : ""}. Mode: ${args.apply ? "APPLY" : "dry run"}.`,
  );
  if (args.apply && target.production && !args["yes-production"])
    fail("This is the production database. Add --yes-production to write.");
}
