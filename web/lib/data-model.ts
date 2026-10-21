/**
 * Canonical location/event types.
 * Schema is public. The processed dataset is not stored in git.
 * Stored in Neon Postgres: see lib/db/schema.ts.
 */

export type EventType = "waste" | "water" | "power" | "weather";

export type Locality = {
  id: string;
  gminaId: string;
  /** SIMC SYM. */
  teryt: string;
  name: string;
  kind: "miasto" | "wies" | "czesc_wsi";
  parentId?: string;
};
