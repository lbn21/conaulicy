// Announced water and power cuts at a place: what a source's notice says.
// Two shapes, so that no code path can turn a notice we could not read with
// certainty into a date: a Disruption has dates we checked against the
// notice itself, a Notice has none, only the link. ZUK's water cuts:
// lib/zuk.ts (read), lib/zuk-store.ts (served).

/** Who announced it, where, and when we last read it (the hard rule). */
type DisruptionSource = {
  name: string;
  /** The notice itself. */
  url: string;
  /** When we last found the notice unchanged: ISO 8601. */
  checkedAt: string;
};

/** Which houses of the place: as the source states it, never a guess. */
export type DisruptionScope =
  | { type: "whole" }
  /** "od nr 1 do 15 i od 16 do 54": both ends included. */
  | { type: "ranges"; ranges: Array<{ from: string; to: string }> }
  | { type: "numbers"; numbers: string[] }
  /** The source names the place but not which houses ("w części"). */
  | { type: "unknown" };

/** A locality or a street, by our ids (TERYT: SIMC, SIMC-SYM_UL). */
type DisruptionPlace = {
  localityId: string;
  streetId: string | null;
};

/**
 * Our names for the place, for its label: never the source's wording. The
 * houses are the scope.
 */
export type DisruptionLabel = {
  /** "Dąbrowa". */
  locality: string;
  /** A village part's village, "Basznia Górna"; else null. */
  parent: string | null;
  /** "Jana III Sobieskiego"; null for the whole locality. */
  street: string | null;
};

export type Disruption = {
  /** Stable across re-reads of the same notice: zuk-<postId>-<date>-<place>. */
  uid: string;
  kind: "water" | "power";
  cause: "planned" | "emergency";
  /** Warsaw day the cut starts, "2026-10-27". */
  date: string;
  /** Warsaw wall clock, "2026-10-27 08:00:00"; null if the notice has none. */
  start: string | null;
  /** Warsaw wall clock, the next day for a night cut; null if none given. */
  end: string | null;
  /** The end is the source's estimate ("przewidywane wznowienie"). */
  endEstimated: boolean;
  place: DisruptionPlace;
  /** Our names for the place (lib/zuk-resolve.ts). */
  label?: DisruptionLabel;
  /** The source's own wording for the place: "Opaka od nr 104 do nr 110". */
  where: string;
  scope: DisruptionScope;
  /** The source's own qualifier: "gospodarstwa zasilane z SUW Mokrzyca". */
  note: string | null;
  /** Warsaw wall clock. */
  publishedAt: string;
  updatedAt: string;
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
  /**
   * A post read but for these places, as written: the rest of its cuts
   * are shown, these are only linked (lib/zuk-data.ts).
   */
  where?: string[];
};
