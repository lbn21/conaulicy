// mirror of schema/data-model.ts on feat/etl, reconcile on merge

/**
 * Canonical location/event types.
 * Schema is public. The processed dataset is not stored in git.
 * Storage is undecided (Vercel Blob, Edge Config, or Marketplace Postgres or Redis).
 */

export type EventType = "waste" | "water" | "power" | "weather";

export type Gmina = {
  id: string;
  teryt: string;
  name: string;
};

export type Locality = {
  id: string;
  gminaId: string;
  /** SIMC SYM. */
  teryt: string;
  name: string;
  kind: "miasto" | "wies" | "czesc_wsi";
  parentId?: string;
};

export type Street = {
  id: string;
  localityId: string;
  /** TERYT SYM_UL. */
  teryt?: string;
  prefix: string;
  name: string;
  houseNumbers?: {
    from?: string;
    to?: string;
    parity?: "even" | "odd";
  };
};

export type Zone = {
  /** For example "waste:miasto-s1". */
  id: string;
  type: EventType;
  name: string;
  members: Array<{
    localityId: string;
    streetId?: string;
    houseNumbers?: {
      from?: string;
      to?: string;
      parity?: "even" | "odd";
    };
  }>;
};

export type Event = {
  /** sha256 of zoneId|subtype|start. */
  id: string;
  type: EventType;
  /** Waste fraction, or a later subtype for water, power, or weather. */
  subtype: string;
  zoneId: string;
  /** ISO date or date-time. */
  start: string;
  end?: string;
  allDay: boolean;
  label: string;
  source: {
    doc: string;
    /** The original document as published (file or page). */
    url?: string;
    /** ISO date the source was last compared with the original. */
    checkedAt?: string;
    sha256?: string;
    /** Page, row, or cell in the source document. */
    ref?: string;
  };
  verified: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  payload?: Record<string, unknown>;
};
