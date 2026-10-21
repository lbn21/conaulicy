// The waste domain's source adapters, by the type names used in
// etl/sources.yaml. A detector finds a source's published files; an extractor
// turns one file into events for one zone and a date range (its scope, which
// the import diffs and replaces). Fetching, logging, issues, batches and
// revert are the core's (../core/), so a new kind of waste source is a new
// detector or extractor here plus config; a new domain is its own folder
// (docs/import.md).
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config, Source } from "../core/config.ts";
import type {
  Detection as CoreDetection,
  Extracted as CoreExtracted,
  Found as CoreFound,
} from "../core/domain.ts";
import type { Http } from "../core/http.ts";
import { readReviewed } from "../core/review.ts";
import { visionPasses } from "../core/vision.ts";
import {
  compareReadings,
  GMINA_ROWS,
  MIASTO_ROWS,
  parseGminaLayout,
  parseReviewed,
  parseVisionJson,
  rowsToEvents,
  type VisionReading,
} from "./lib.ts";

// ------------------------------------------------------------------ detect

/** A schedule file: one sector's schedule for one year. */
export type Found = CoreFound & { sector: number; year: number };
export type Detection = CoreDetection & { files: Found[] };
type Detector = (source: Source, site: string, net: Http) => Promise<Detection>;

const nameMatch = (source: Source, name: string) =>
  new RegExp(source.detect.file).exec(name)?.groups;

/** Only the newest schedule year counts; older files are history. */
function latestYear(files: Found[]): Found[] {
  const year = Math.max(...files.map((f) => f.year));
  return files.filter((f) => f.year === year);
}

export const DETECTORS: Record<string, Detector> = {
  /** Media attached to one page (the city's schedule page). */
  async "wp-media"(source, site, net) {
    const items = (await (
      await net.get(
        `${site}/wp-json/wp/v2/media?parent=${source.detect.parent}&per_page=100`,
      )
    ).json()) as Array<{
      id: number;
      modified_gmt: string;
      source_url: string;
      mime_type: string;
      media_details?: { original_image?: string };
    }>;
    const files: Found[] = [];
    const others: typeof items = [];
    for (const item of items) {
      // The original upload, not WordPress's -scaled copy.
      const original = item.media_details?.original_image;
      const name =
        original ?? path.posix.basename(new URL(item.source_url).pathname);
      const url = original
        ? `${item.source_url.slice(0, item.source_url.lastIndexOf("/") + 1)}${original}`
        : item.source_url;
      const groups = nameMatch(source, name);
      if (groups)
        files.push({
          name,
          url,
          mediaId: item.id,
          modified: item.modified_gmt,
          sector: Number(groups.sector),
          year: Number(groups.year),
        });
      else others.push(item);
    }
    // A newer upload the adapter cannot read (a PNG, a half-year schedule…).
    const newest =
      files
        .map((f) => f.modified ?? "")
        .sort()
        .at(-1) ?? "";
    const unrecognised = others
      .filter(
        (o) => o.mime_type.startsWith("image/") && o.modified_gmt > newest,
      )
      .map((o) => `${o.source_url} (media ${o.id}, ${o.modified_gmt})`);
    return { files: latestYear(files), page: null, unrecognised, via: "api" };
  },

  /** Files linked from the newest yearly schedule post (the gmina's PDFs). */
  async "wp-post-files"(source, site, net) {
    const { postSearch, postTitle } = source.detect;
    const posts = (await (
      await net.get(
        `${site}/wp-json/wp/v2/posts?search=${encodeURIComponent(postSearch ?? "")}&per_page=10&_fields=id,link,title,content`,
      )
    ).json()) as Array<{
      id: number;
      link: string;
      title: { rendered: string };
      content: { rendered: string };
    }>;
    const newest = posts
      .map((p) => ({
        p,
        year: Number(
          new RegExp(postTitle ?? "").exec(p.title.rendered.trim())?.groups
            ?.year,
        ),
      }))
      .filter((x) => x.year)
      .sort((a, b) => b.year - a.year)[0];
    if (!newest) throw new Error(`no post titled ${postTitle}`);
    const files: Found[] = [];
    const unrecognised: string[] = [];
    for (const href of new Set(
      [...newest.p.content.rendered.matchAll(/href="([^"]+\.pdf)"/g)].map(
        (m) => m[1],
      ),
    )) {
      const name = decodeURIComponent(
        path.posix.basename(new URL(href).pathname),
      );
      const groups = nameMatch(source, name);
      if (!groups) {
        unrecognised.push(`${href} (linked from post ${newest.p.id})`);
        continue;
      }
      const media = (await (
        await net.get(
          `${site}/wp-json/wp/v2/media?search=${encodeURIComponent(name.replace(/(\.pdf)+$/i, ""))}&per_page=10&_fields=id,modified_gmt,source_url`,
        )
      ).json()) as Array<{
        id: number;
        modified_gmt: string;
        source_url: string;
      }>;
      const item = media.find((m) => m.source_url === href);
      files.push({
        name,
        url: href,
        mediaId: item?.id ?? null,
        modified: item?.modified_gmt ?? null,
        sector: Number(groups.sector),
        year: Number(groups.year),
      });
    }
    return {
      files: latestYear(files),
      page: newest.p.link,
      unrecognised,
      via: "api",
    };
  },
};

// ------------------------------------------------------------------ pages

/** Detection from the watched pages, when the WordPress API is down. */
export function detectFromPages(
  source: Source,
  pages: Array<{ links: string[] }>,
): Detection {
  const files: Found[] = [];
  for (const url of new Set(pages.flatMap((p) => p.links))) {
    const name = decodeURIComponent(path.posix.basename(new URL(url).pathname));
    const groups = nameMatch(source, name);
    if (groups)
      files.push({
        name,
        url,
        mediaId: null,
        modified: null,
        sector: Number(groups.sector),
        year: Number(groups.year),
      });
  }
  if (files.length === 0)
    throw new Error("no schedule files on the watched pages either");
  return {
    files: latestYear(files),
    page: null,
    unrecognised: [],
    via: "page",
  };
}

// ------------------------------------------------------------------ extract

export type Extracted = CoreExtracted & {
  /** Vision only: each pass's streets, checked for review, never applied. */
  streetReadings?: string[][];
  /** Vision only: each pass's reading; disagree: a review PR decides. */
  readings?: VisionReading[];
  disagree?: boolean;
};
type Extractor = (input: {
  source: Source;
  config: Config;
  file: Found;
  body: Buffer;
  doc: string;
  digest: string;
}) => Promise<Extracted>;

const schedule = (
  source: Source,
  file: Found,
  ref: { doc: string; url: string; sha256: string },
  rows: Record<string, number[][]>,
  fractions: Record<string, string[]>,
  listed: string[],
): Extracted => {
  const zoneId = source.zone.replace("{sector}", String(file.sector));
  const built = rowsToEvents(zoneId, file.year, rows, fractions, ref);
  return {
    zoneId,
    scope: { from: `${file.year}-01-01`, to: `${file.year}-12-31` },
    year: file.year,
    events: built.events,
    listed,
    problems: built.problems,
  };
};

export const EXTRACTORS: Record<string, Extractor> = {
  /** The PDF's text layer, parsed deterministically (pdftotext -layout). */
  async "gmina-pdf-text"({ source, file, body, doc, digest }) {
    const dir = mkdtempSync(path.join(tmpdir(), "pdf-"));
    writeFileSync(path.join(dir, "source.pdf"), body);
    const run = spawnSync(
      "pdftotext",
      ["-layout", path.join(dir, "source.pdf"), "-"],
      { encoding: "utf8" },
    );
    // The message without the temporary path, so the same problem keeps its issue.
    if (run.status !== 0)
      throw new Error(
        `pdftotext cannot read it: ${(run.stderr ?? "").split("\n")[0]}`,
      );
    const text = run.stdout;
    const table = parseGminaLayout(text);
    return schedule(
      source,
      file,
      { doc, url: file.url, sha256: digest },
      table.rows,
      GMINA_ROWS,
      table.places,
    );
  },

  /**
   * Two independent Cursor CLI vision passes; their dates apply only if they
   * agree, else a review PR (check.ts) proposes vision.reviewFrom's reading.
   * A merged review of this exact file (sha256) replaces the passes.
   */
  async "miasto-jpg-vision"({ source, config, file, body, doc, digest }) {
    const rows = Object.keys(MIASTO_ROWS);
    const ref = { doc, url: file.url, sha256: digest };
    const sameFile = (r: VisionReading) => {
      if (r.sector !== file.sector || r.year !== file.year)
        throw new Error(`the image says sector ${r.sector}, ${r.year}`);
    };
    const approved = readReviewed(source.id, file.name, digest);
    if (approved) {
      const reading = parseReviewed(approved, rows);
      sameFile(reading);
      console.log(`${file.name}: dates from its merged review.`);
      // Reviewed by a person: no street review again.
      return {
        ...schedule(source, file, ref, reading.rows, MIASTO_ROWS, []),
        streetReadings: [],
      };
    }
    const outputs = visionPasses(
      config,
      body,
      (image) => VISION_PROMPT(image, rows),
      `${source.id}-s${file.sector}-${file.year}`,
    );
    const ids = config.vision.passes.map((p) => p.id);
    const readings = outputs.map((o, i) => {
      try {
        return parseVisionJson(o, rows);
      } catch (error) {
        throw new Error(
          `vision pass ${ids[i]} (${config.vision.passes[i].model}) is not valid JSON for the schema: ${(error as Error).message}`,
        );
      }
    });
    const disagree = compareReadings(readings[0], readings[1]).length > 0;
    const reading = disagree
      ? readings[ids.indexOf(config.vision.reviewFrom)]
      : readings[0];
    if (!disagree) sameFile(reading);
    return {
      ...schedule(
        source,
        file,
        ref,
        reading.rows,
        MIASTO_ROWS,
        reading.streets,
      ),
      streetReadings: readings.map((r) => r.streets),
      readings,
      disagree,
    };
  },
};

const VISION_PROMPT = (image: string, rows: string[]) =>
  [
    `Read the waste collection schedule image ${image}. Do not modify any file and do not run commands.`,
    "Respond with the JSON object only, no other text. Exactly this shape:",
    `{"sector": <sector number>, "year": <year>, "streets": [<every street name listed, as written>], "rows": {${rows
      .map((r) => `"${r}": [12 arrays of day numbers, January to December]`)
      .join(", ")}}}`,
    `Rows in table order: ${rows.join("; ")}. A cell with no date is []. Days are integers.`,
  ].join("\n");
