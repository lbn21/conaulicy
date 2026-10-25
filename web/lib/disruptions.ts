// Announced water and power cuts at a place: what a source's notice says,
// read live (lib/zuk.ts). Two shapes, so that no code path can turn a notice
// we could not read with certainty into a date: a Disruption has dates we
// checked against the notice itself, a Notice has none, only the link.

/** Who announced it, where, and when we last read it (the hard rule). */
export type DisruptionSource = {
  name: string;
  /** The notice itself. */
  url: string;
  /** When the caller fetched the notice: ISO 8601. */
  checkedAt: string;
};

/** Which houses of the place: as the source states it, never a guess. */
export type DisruptionScope =
  | { type: "whole" }
  | {
      type: "range";
      from: string;
      to: string;
      parity: "even" | "odd" | null;
    }
  | { type: "numbers"; numbers: string[] }
  /** The source names the place but not which houses ("część", plots). */
  | { type: "unknown" };

/** A locality or a street, by our ids (TERYT: SIMC, SIMC-SYM_UL). */
export type DisruptionPlace = {
  localityId: string;
  streetId: string | null;
};

export type Disruption = {
  /** Stable across re-reads of the same notice: zuk-<postId>-<date>-<place>. */
  uid: string;
  kind: "water" | "power";
  /** Warsaw wall clock, "2026-10-27 08:00:00", like events.start. */
  start: string;
  end: string;
  place: DisruptionPlace;
  /** The source's own wording for the place: "Opaka od nr 104 do nr 110". */
  where: string;
  scope: DisruptionScope;
  status: "planned" | "revoked";
  /** The source's own sentence about the revocation. */
  revokedNote: string | null;
  /** Warsaw wall clock. */
  publishedAt: string;
  updatedAt: string;
  /** Grows with every edit of the notice (ICS SEQUENCE). */
  version: number;
  source: DisruptionSource;
};

/**
 * A notice we could not read with certainty: a link, no date we produced.
 * `localityIds` are the places it may concern, every candidate included, so
 * a page can say "may concern"; empty if none could be told.
 */
export type Notice = {
  uid: string;
  kind: "water" | "power";
  /** The source's title. */
  title: string;
  localityIds: string[];
  publishedAt: string;
  updatedAt: string;
  source: DisruptionSource;
};
