// Loads etl/sources.yaml, the one configuration (sources, public pages,
// detection, models, thresholds, alerts, archive, site features),
// and checks it against etl/sources.schema.json plus the rules a schema
// cannot express (the core's, and each source's domain's). Everything derived
// from it is in scripts/config-sync.ts. Each domain's own settings
// (domains.<name>, and the <name> block of its sources) are typed by that
// domain.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { DOMAINS } from "../domains.ts";
import { ROOT } from "./paths.ts";

export { ROOT };

const CONFIG_FILE = path.join(ROOT, "etl/sources.yaml");
export const SCHEMA_FILE = path.join(ROOT, "etl/sources.schema.json");

export type Source = {
  id: string;
  /** Its domain (../domains.ts): what its files mean and how they are checked. */
  domain: string;
  name: string;
  origin: string;
  /** The public page the site links to (never the archive). */
  page: string;
  /** The detector by type, with its own settings (typed by the domain). */
  detect: { type: string } & Record<string, unknown>;
  watch?: Array<{ url: string; links: string; ignore?: string[] }>;
  extract: { type: string };
};

export type Config = {
  site: {
    url: string;
    features: Array<{
      section: string;
      links: Array<{ href: string; text: string }>;
    }>;
  };
  import: {
    retries: { attempts: number; backoffSeconds: number };
  };
  /** Each domain's settings; coverageMinDays opts it in to the dead-man switch. */
  domains: Record<string, { coverageMinDays?: number }>;
  vision: {
    cli: string;
    passes: Array<{ id: string; vendor: string; model: string }>;
    /** The pass whose reading pre-fills a review PR's reviewed-data file. */
    reviewFrom: string;
    /** The only pass whose list of what the file covers the domain checks. */
    streetCheckFrom: string;
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
  for (const key of ["reviewFrom", "streetCheckFrom"] as const)
    if (!passIds.includes(config.vision[key]))
      errors.push(`vision.${key}: ${config.vision[key]} is not a pass id`);
  for (const s of config.sources) {
    for (const w of s.watch ?? []) {
      try {
        new RegExp(w.links);
      } catch {
        errors.push(`${s.id}: invalid pattern ${w.links}`);
      }
    }
    errors.push(...(DOMAINS[s.domain]?.configErrors(s) ?? []));
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
