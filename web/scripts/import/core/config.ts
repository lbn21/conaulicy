// Loads etl/sources.yaml, the one configuration (sources, public pages,
// detection, schedule, models, thresholds, alerts, archive, site features),
// and checks it against etl/sources.schema.json plus the rules a schema
// cannot express. Everything derived from it is in scripts/config-sync.ts.
// Each domain's own settings (domains.<name>) are typed by that domain.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const ROOT = path.resolve(import.meta.dirname, "../../../..");
export const CONFIG_FILE = path.join(ROOT, "etl/sources.yaml");
export const SCHEMA_FILE = path.join(ROOT, "etl/sources.schema.json");

export type Source = {
  id: string;
  /** Its domain (../domains.ts): what its files mean and how they are checked. */
  domain: string;
  name: string;
  origin: string;
  gmina: { id: string; teryt: string };
  page: string;
  detect: {
    type: string;
    site: string;
    parent?: number;
    postSearch?: string;
    postTitle?: string;
    file: string;
  };
  watch: Array<{ url: string; links: string; ignore?: string[] }>;
  zone: string;
  extract: { type: string };
  validate: string[];
  aliases?: Record<string, string>;
};

export type Config = {
  site: {
    url: string;
    features: Array<{
      section: string;
      links: Array<{ href: string; text: string }>;
    }>;
  };
  schedule: { enabled: boolean; time: string; timezone: string };
  import: {
    retries: { attempts: number; backoffSeconds: number };
    alerts: { coverageMinDays: number };
  };
  domains: Record<string, unknown>;
  vision: {
    cli: string;
    passes: Array<{ id: string; vendor: string; model: string }>;
    /** The pass whose reading pre-fills a review PR's reviewed-data file. */
    reviewFrom: string;
  };
  archive: { bucket: string; region: string; role: string };
  sources: Source[];
  archived: Array<{
    file: string;
    origin: string;
    fetched: string;
    url?: string;
    sha256: string;
  }>;
};

type Schema = {
  type?: string;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
};

/** The JSON Schema subset etl/sources.schema.json uses; [] when valid. */
export function schemaErrors(
  value: unknown,
  schema: Schema,
  at = "$",
): string[] {
  const errors: string[] = [];
  const kind = Array.isArray(value)
    ? "array"
    : Number.isInteger(value)
      ? "integer"
      : value === null
        ? "null"
        : typeof value;
  if (schema.enum && !schema.enum.includes(value))
    return [`${at}: must be one of ${schema.enum.join(", ")}`];
  if (
    schema.type &&
    schema.type !== kind &&
    !(schema.type === "number" && kind === "integer")
  )
    return [`${at}: must be ${schema.type}`];
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength)
      errors.push(`${at}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
      errors.push(`${at}: "${value}" does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${at}: at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${at}: at most ${schema.maxItems} items`);
    if (schema.items)
      value.forEach((item, i) => {
        errors.push(
          ...schemaErrors(item, schema.items as Schema, `${at}[${i}]`),
        );
      });
  }
  if (kind === "object") {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in object)) errors.push(`${at}.${key}: required`);
    for (const [key, item] of Object.entries(object)) {
      const property = schema.properties?.[key];
      if (property)
        errors.push(...schemaErrors(item, property, `${at}.${key}`));
      else if (schema.additionalProperties === false)
        errors.push(`${at}.${key}: unknown key`);
      else if (typeof schema.additionalProperties === "object")
        errors.push(
          ...schemaErrors(item, schema.additionalProperties, `${at}.${key}`),
        );
    }
  }
  return errors;
}

/** Rules beyond the schema; [] when the config is sound. */
export function configErrors(config: Config): string[] {
  const errors: string[] = [];
  const ids = config.sources.map((s) => s.id);
  if (new Set(ids).size !== ids.length) errors.push("sources: duplicate id");
  const passIds = config.vision.passes.map((p) => p.id);
  if (new Set(passIds).size !== passIds.length)
    errors.push("vision.passes: duplicate pass id");
  if (!passIds.includes(config.vision.reviewFrom))
    errors.push(
      `vision.reviewFrom: ${config.vision.reviewFrom} is not a pass id`,
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: config.schedule.timezone });
  } catch {
    errors.push(
      `schedule.timezone: unknown time zone ${config.schedule.timezone}`,
    );
  }
  for (const s of config.sources) {
    const host = new URL(s.detect.site).host;
    // Public links are the original pages, never the archive.
    for (const [name, url] of [
      ["page", s.page],
      ...s.watch.map((w) => ["watch", w.url]),
    ])
      if (new URL(url).host !== host)
        errors.push(`${s.id}.${name}: ${url} is not on ${host}`);
    for (const pattern of [
      s.detect.file,
      s.detect.postTitle,
      ...s.watch.map((w) => w.links),
    ]) {
      if (pattern === undefined) continue;
      try {
        new RegExp(pattern);
      } catch {
        errors.push(`${s.id}: invalid pattern ${pattern}`);
      }
    }
    if (
      !/\(\?<sector>/.test(s.detect.file) ||
      !/\(\?<year>/.test(s.detect.file)
    )
      errors.push(`${s.id}.detect.file: needs (?<sector>…) and (?<year>…)`);
    if (s.detect.type === "wp-media" && !s.detect.parent)
      errors.push(`${s.id}.detect: wp-media needs parent`);
    if (
      s.detect.type === "wp-post-files" &&
      !(s.detect.postSearch && s.detect.postTitle)
    )
      errors.push(
        `${s.id}.detect: wp-post-files needs postSearch and postTitle`,
      );
  }
  for (const a of config.archived)
    if (a.url && /amazonaws\.com|s3:\/\//.test(a.url))
      errors.push(
        `archived ${a.file}: the public URL must be the original, not S3`,
      );
  return errors;
}

export function loadConfig(file = CONFIG_FILE): Config {
  const config = parseYaml(readFileSync(file, "utf8")) as Config;
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8")) as Schema;
  const errors = schemaErrors(config, schema);
  if (errors.length === 0) errors.push(...configErrors(config));
  if (errors.length > 0)
    throw new Error(`${path.relative(ROOT, file)}:\n- ${errors.join("\n- ")}`);
  return config;
}

/** S3 key of an archived file. */
export const archiveKey = (a: Config["archived"][number]) =>
  `sources/${a.origin}/${a.fetched}/${a.file}`;

/**
 * The UTC cron lines that fire at schedule.time in its time zone on every
 * day of the year: one per UTC offset the zone uses (two with DST).
 */
export function cronLines(schedule: Config["schedule"], year = 2026): string[] {
  if (!schedule.enabled) return [];
  const hour = Number(schedule.time.slice(0, 2));
  const offsets = new Set<number>();
  for (let day = 0; day < 366; day += 1) {
    const date = new Date(Date.UTC(year, 0, 1 + day, 12));
    offsets.add(utcOffsetHours(date, schedule.timezone));
  }
  return [...offsets]
    .map((offset) => (hour - offset + 24) % 24)
    .sort((a, b) => a - b)
    .map((utc) => `0 ${utc} * * *`);
}

/** The zone's UTC offset in hours at a moment (e.g. 2 for CEST). */
export function utcOffsetHours(date: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(part ?? "");
  if (!m?.[1]) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
}

/** Local date and hour in the schedule's time zone. */
export function localNow(timeZone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}
