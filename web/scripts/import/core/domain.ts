// What a domain (e.g. waste schedules, weather warnings or water cuts) plugs
// into the shared import: its detector and extractor types, by the names used
// in etl/sources.yaml, its config rules, its checks and its database rows.
// The core (run.ts) does the rest: fetching, archiving, watching pages,
// diffing, batches, issues, logging.

import type { Config, Source } from "./config.ts";
import type { Queryable } from "./db.ts";
import type { EventRow } from "./events.ts";
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
type Detector = (source: Source, net: Http) => Promise<Detection>;

/** One file's events, for one zone (a location in the shared events table). */
export type Extracted = {
  zoneId: string;
  /** The range the import replaces: events of the zone from..to (ISO dates). */
  scope: { from: string; to: string };
  /** The domain's events, turned into database rows by Domain.rows. */
  events: unknown[];
  /** What the file says it covers, for the domain's checks. */
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
  /** Rules for one of its sources beyond the schema; [] when sound. */
  configErrors(source: Source): string[];
  /**
   * After detection, before any file (not with --extract-only): e.g. keep
   * the database in step with the config. True if the site needs a refresh.
   */
  afterDetect?(input: {
    db: Queryable;
    source: Source;
    detection: Detection;
    issues: Issues;
    dryRun: boolean;
  }): Promise<boolean>;
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
    digest: string;
    out: Extracted;
    zoneName: string;
    issues: Issues;
    reviews: Reviews;
    dryRun: boolean;
    runUrl: string;
  }): Promise<string[]>;
  /**
   * One file's events as database rows; checkedAt: the day the file was last
   * compared with the original.
   */
  rows(input: {
    out: Extracted;
    zoneName: string;
    doc: string;
    checkedAt: string;
  }): EventRow[];
  /** How to fix what blocks one of its files, in that issue: "Fix the cause (…)". */
  fixHint: string;
  /** The dead-man switch's issue title (domains.<name>.coverageMinDays opts in). */
  coverageTitle?: string;
};
