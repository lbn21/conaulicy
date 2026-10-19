import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as neonHttp } from "drizzle-orm/neon-http";
import { drizzle as nodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export * from "./schema.ts";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let client: Db | undefined;

// Neon over HTTP: one fetch per query, no pool to keep warm in a function.
// Any other Postgres (CI, a local server) goes through node-postgres.
export function db(): Db {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  client = new URL(url).hostname.endsWith(".neon.tech")
    ? neonHttp(neon(url), { schema, casing: "snake_case" })
    : nodePg(url, { schema, casing: "snake_case" });
  return client;
}
