// The waste domain's source adapters, by the type names used in
// etl/sources.yaml. A detector finds a source's published files; the one
// extractor (waste-ai) has Grok read a file into events for one zone and a
// date range (its scope, which the import diffs and replaces). Fetching,
// logging, issues, batches and revert are the core's (../core/), so a new
// kind of waste source is a new detector or layout here plus config; a new
// domain is its own folder (docs/import.md).
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type AiUsage, ZUK_EFFORT, ZUK_MODEL } from "../../../lib/zuk-ai.ts";
import type { Etl } from "../../lib/import-data.ts";
import type { Source } from "../core/config.ts";
import type {
  Detection as CoreDetection,
  Extracted as CoreExtracted,
  Found as CoreFound,
} from "../core/domain.ts";
import { sha256 } from "../core/hash.ts";
import type { Http } from "../core/http.ts";
import { type ReadWith, type Reviews, readReviewed } from "../core/review.ts";
import {
  checkReply,
  LAYOUT_ROWS,
  parseReviewed,
  type Reading,
  rowsToEvents,
} from "./lib.ts";
import { type Layout, schedulePrompt } from "./prompts.ts";
import { readSchedule } from "./xai.ts";

// ------------------------------------------------------------------ detect

/** A waste source: its detector's settings, and its waste block. */
export type WasteSource = Source & {
  extract: { type: string; layout: Layout };
  detect: {
    site: string;
    parent?: number;
    postSearch?: string;
    postTitle?: string;
    file: string;
  };
  waste: {
    gmina: { id: string; teryt: string };
    zone: string;
    validate: string[];
  };
};

/** A schedule file: one sector's schedule for one year. */
export type Found = CoreFound & { sector: number; year: number };
export type Detection = CoreDetection & { files: Found[] };
type Detector = (source: WasteSource, net: Http) => Promise<Detection>;

const nameMatch = (source: WasteSource, name: string) =>
  new RegExp(source.detect.file).exec(name)?.groups;

/** Only the newest schedule year counts; older files are history. */
function latestYear(files: Found[]): Found[] {
  const year = Math.max(...files.map((f) => f.year));
  return files.filter((f) => f.year === year);
}

export const DETECTORS: Record<string, Detector> = {
  /** Media attached to one page (the city's schedule page). */
  async "wp-media"(source, net) {
    const { site } = source.detect;
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
  async "wp-post-files"(source, net) {
    const { site, postSearch, postTitle } = source.detect;
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
  source: WasteSource,
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
  year: number;
  events: Etl["events"];
  /** Dates from the file's merged review: they apply as usual. */
  reviewed: boolean;
  /**
   * Not read: this sha256 already has a review PR (open, merged but not in
   * this checkout, or rejected for a reading with this same prompt, model
   * and effort), so no xAI call and the PR is left as it is.
   */
  pending?: { state: "open" | "merged" | "rejected"; url: string };
  /** Else Grok's fresh reading, for its review PR (check.ts). */
  read?: {
    /** The prompt's sha256, the model and the effort asked, recorded in the PR. */
    readWith: ReadWith;
    /** The reply as given. */
    content: string;
    /** null when the reply has not the layout's shape. */
    reading: Reading | null;
    /** What the literal checks found (and dates that are not dates). */
    findings: string[];
    model: string;
    usage: AiUsage;
    costUsd: number;
    latencyMs: number;
  };
};
type Extractor = (input: {
  source: WasteSource;
  file: Found;
  body: Buffer;
  doc: string;
  digest: string;
  reviews: Reviews;
}) => Promise<Extracted>;

const schedule = (
  source: WasteSource,
  file: Found,
  ref: { doc: string; url: string; sha256: string },
  rows: Record<string, number[][]>,
  fractions: Record<string, string[]>,
  listed: string[],
) => {
  const zoneId = source.waste.zone.replace("{sector}", String(file.sector));
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

/** One pdftoppm run at most this long (a schedule page takes about a second). */
export const RENDER_TIMEOUT_MS = 60_000;

/**
 * A one-page PDF as a PNG for Grok (image preparation only, no text layer):
 * pdftoppm -r 150 -png -singlefile. The page count is the number of pages
 * pdftoppm renders (small, into an empty directory), so no text tool reads it.
 * timeoutMs: tests shorten it.
 */
export function renderPdf(body: Buffer, timeoutMs = RENDER_TIMEOUT_MS): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "pdf-"));
  try {
    const pdf = path.join(dir, "source.pdf");
    writeFileSync(pdf, body);
    const pages = path.join(dir, "pages");
    mkdirSync(pages);
    const pdftoppm = (args: string[]) => {
      const run = spawnSync("pdftoppm", args, { timeout: timeoutMs });
      if (run.error && "code" in run.error && run.error.code === "ETIMEDOUT")
        throw new Error(`pdftoppm did not finish within ${timeoutMs / 1000} s`);
      // The message without the temporary path, so the same problem keeps its issue.
      if (run.status !== 0)
        throw new Error(
          `pdftoppm cannot render it (exit ${run.status ?? run.error?.message})`,
        );
    };
    pdftoppm(["-r", "10", "-png", pdf, path.join(pages, "page")]);
    const count = readdirSync(pages).length;
    if (count !== 1) throw new Error(`${count} pages, expected 1`);
    pdftoppm(["-r", "150", "-png", "-singlefile", pdf, path.join(dir, "out")]);
    return readFileSync(path.join(dir, "out.png"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Grok reads the file once (layout gmina: the PDF rendered to PNG; miasto:
 * the JPG as is); its reply is checked literally and always goes to a review
 * PR (check.ts). A merged review of this exact file (sha256) replaces the
 * reading: no call, its dates apply. A sha256 that already has a review PR
 * (open, merged but not checked out, or rejected for a reading with this
 * same prompt sha256, model and effort) is not read again: no call, and
 * check.ts leaves the PR alone. A rejected review of another reading
 * (another prompt, model or effort, or one not recorded) is read again and
 * gets a new PR. The prompt's sha256 is of the whole text sent: the
 * instructions and the TERYT place list (prompts.ts). deps: tests
 * inject the network, the key and the renderer.
 */
export function wasteAi(
  deps: {
    fetcher?: typeof fetch;
    apiKey?: string;
    render?: (pdf: Buffer) => Buffer;
  } = {},
): Extractor {
  return async ({ source, file, body, doc, digest, reviews }) => {
    const { layout } = source.extract;
    const rows = LAYOUT_ROWS[layout];
    const ref = { doc, url: file.url, sha256: digest };
    const prompt = schedulePrompt(layout);
    const approved = readReviewed(source.id, file.name, digest);
    if (approved) {
      const { reading, findings } = parseReviewed(
        approved,
        layout,
        prompt.ids,
        file,
      );
      if (!reading)
        throw new Error(
          `its merged review does not pass the checks: ${findings.join("; ")}`,
        );
      console.log(`${file.name}: dates from its merged review.`);
      return {
        ...schedule(
          source,
          file,
          ref,
          reading.rows,
          rows,
          reading.places.map((p) => p.as_written),
        ),
        reviewed: true,
      };
    }
    // Its review is already open, merged, or rejected for this same
    // reading: never a second call.
    const readWith = {
      prompt: sha256(prompt.text),
      model: ZUK_MODEL,
      effort: ZUK_EFFORT,
    };
    const { sameOpen, merged, rejected, rejectedOther } = reviews.status(
      source.id,
      file.name,
      digest,
      readWith,
    );
    const review = sameOpen
      ? { state: "open" as const, url: sameOpen.url }
      : merged
        ? { state: "merged" as const, url: merged.url }
        : rejected
          ? { state: "rejected" as const, url: rejected.url }
          : null;
    if (review) {
      console.log(
        `${file.name}: not read again, its review is ${review.state} (${review.url}).`,
      );
      return {
        ...schedule(source, file, ref, {}, rows, []),
        reviewed: false,
        pending: review,
      };
    }
    if (rejectedOther)
      console.log(
        `${file.name}: its review ${rejectedOther.url} was rejected for another reading (prompt sha256 ${rejectedOther.prompt ?? "not recorded"}, model ${rejectedOther.model ?? "not recorded"}, effort ${rejectedOther.effort ?? "not recorded"}); read again with prompt sha256 ${readWith.prompt}, model ${readWith.model}, effort ${readWith.effort}.`,
      );
    const image =
      layout === "gmina"
        ? { body: (deps.render ?? renderPdf)(body), mime: "image/png" as const }
        : { body, mime: "image/jpeg" as const };
    const reply = await readSchedule(
      prompt.text,
      image,
      `${source.id}-s${file.sector}-${file.year}`,
      deps,
    );
    const { reading, findings } = checkReply(
      reply.content,
      layout,
      prompt.ids,
      file,
    );
    const built = schedule(
      source,
      file,
      ref,
      reading?.rows ?? {},
      rows,
      reading?.places.map((p) => p.as_written) ?? [],
    );
    // Every finding goes to the review PR, dates that are not dates too.
    return {
      ...built,
      problems: [],
      reviewed: false,
      read: {
        ...reply,
        readWith,
        reading,
        findings: [...findings, ...built.problems],
      },
    };
  };
}

export const EXTRACTORS: Record<string, Extractor> = {
  "waste-ai": wasteAi(),
};
