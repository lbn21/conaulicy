// What a domain (waste schedules; later e.g. weather warnings or water cuts)
// plugs into the shared import: its detector and extractor types, by the names
// used in etl/sources.yaml, and its checks. The core (run.ts) does the rest:
// fetching, archiving, watching pages, diffing, batches, issues, logging.

import type { Etl } from "../../lib/import-data.ts";
import type { Config, Source } from "./config.ts";
import type { Queryable } from "./db.ts";
import type { Http } from "./http.ts";
import type { Issues } from "./issues.ts";
import type { Reviews } from "./review.ts";
import type { readWatched } from "./watch.ts";

/** One published file a detector found. */
export type Found = {
  name: string;
  url: string;
  mediaId: number | null;
  modified: string | null;
};
export type Detection = {
  files: Found[];
  /** The public page the files were found on, if the detector knows it. */
  page: string | null;
  unrecognised: string[];
  via: "api" | "page";
};
export type Detector = (
  source: Source,
  site: string,
  net: Http,
) => Promise<Detection>;

export type Extracted = {
  zoneId: string;
  /** The range the import replaces: events of the zone from..to (ISO dates). */
  scope: { from: string; to: string };
  year: number;
  events: Etl["events"];
  /** Places or streets the file lists, for the member checks. */
  listed: string[];
  problems: string[];
};
export type Extractor = (input: {
  source: Source;
  config: Config;
  file: Found;
  body: Buffer;
  doc: string;
  digest: string;
}) => Promise<Extracted>;

export type Domain = {
  detectors: Record<string, Detector>;
  extractors: Record<string, Extractor>;
  /** Detection from the watched pages, when the source's API is down. */
  detectFromPages(
    source: Source,
    pages: Awaited<ReturnType<typeof readWatched>>,
  ): Detection;
  /**
   * The domain's checks of one extracted file before it is applied: each
   * problem blocks it. db is null with --extract-only (no database). A file
   * that needs a person gets a review PR (reviews.open) and is held
   * (reviews.hold) instead.
   */
  check(input: {
    db: Queryable | null;
    config: Config;
    source: Source;
    file: Found;
    body: Buffer;
    digest: string;
    out: Extracted;
    zoneName: string;
    issues: Issues;
    reviews: Reviews;
    dryRun: boolean;
    runUrl: string;
  }): Promise<string[]>;
};
