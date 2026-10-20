// Source adapters for the unattended import, by the type names used in
// etl/sources.yaml. A detector finds a source's published files; an extractor
// turns one file into events for one zone and a date range (its scope, which
// the import diffs and replaces). Logging, issues, validation, batches and
// revert are shared (run.ts), so a new kind of source is a new detector or
// extractor here plus config. E.g. water cuts announced as posts (MZGKiM RSS,
// gmina WP posts): a "rss" or "wp-posts" detector returning one Found per
// post, and an "announcement-post" extractor returning that post's events,
// scope = the zone(s) and dates it covers.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config, Source } from "../config.ts";
import type { Etl } from "../lib/import-data.ts";
import {
  compareReadings,
  GMINA_ROWS,
  MIASTO_ROWS,
  parseGminaLayout,
  parseVisionJson,
  rowsToEvents,
} from "./lib.ts";

const UA = "conaulicy-import (+https://conaulicy.pl)";

// ------------------------------------------------------------------ http

export type Http = { get(url: string): Promise<Response> };

/** GET with retries and doubling backoff on network errors, 429 and 5xx. */
export function http(retries: Config["import"]["retries"]): Http {
  return {
    async get(url) {
      let last: Error = new Error(`GET ${url}: no attempt`);
      for (let attempt = 1; attempt <= retries.attempts; attempt++) {
        try {
          const response = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(60_000),
          });
          if (response.ok) return response;
          last = new Error(`GET ${url}: HTTP ${response.status}`);
          if (response.status !== 429 && response.status < 500) throw last;
        } catch (error) {
          last = error as Error;
          if (/HTTP 4\d\d/.test(last.message) && !/HTTP 429/.test(last.message))
            throw last;
        }
        if (attempt < retries.attempts) {
          const wait = retries.backoffSeconds * 1000 * 2 ** (attempt - 1);
          console.log(
            `  retry ${attempt}/${retries.attempts - 1} in ${wait / 1000}s: ${last.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
      throw last;
    },
  };
}

// ------------------------------------------------------------------ detect

export type Found = {
  name: string;
  url: string;
  mediaId: number | null;
  modified: string | null;
  sector: number;
  year: number;
};
export type Detection = {
  files: Found[];
  /** The public page the files were found on, if the detector knows it. */
  page: string | null;
  unrecognised: string[];
  via: "api" | "page";
};
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

/** Absolute links in a page that match a pattern, sorted, without repeats. */
export function pageLinks(
  html: string,
  base: string,
  pattern: string,
): string[] {
  const re = new RegExp(pattern);
  const links = new Set<string>();
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    try {
      const url = new URL(
        raw.replaceAll("&#038;", "&").replaceAll("&amp;", "&"),
        base,
      ).href;
      if (re.test(url)) links.add(url);
    } catch {}
  }
  return [...links].sort();
}

export const linksHash = (links: string[]) =>
  createHash("sha256").update(links.join("\n")).digest("hex");

/** The watched pages' schedule links (also the fallback detector). */
export async function readWatched(source: Source, net: Http) {
  const pages: Array<{ url: string; links: string[]; ignore: string[] }> = [];
  for (const w of source.watch) {
    const html = await (await net.get(w.url)).text();
    pages.push({
      url: w.url,
      links: pageLinks(html, w.url, w.links),
      ignore: w.ignore ?? [],
    });
  }
  return pages;
}

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

  /** Two Cursor CLI vision passes from different vendors; both must agree. */
  async "miasto-jpg-vision"({ source, config, file, body, doc, digest }) {
    const rows = Object.keys(MIASTO_ROWS);
    const outputs = visionPasses(source, config, file, body, rows);
    const readings = outputs.map((o, i) => {
      try {
        return parseVisionJson(o, rows);
      } catch (error) {
        throw new Error(
          `vision pass ${i + 1} (${config.vision.passes[i].model}) is not valid JSON for the schema: ${(error as Error).message}`,
        );
      }
    });
    const diffs = compareReadings(readings[0], readings[1]);
    if (diffs.length)
      throw new Error(
        `the two vision passes disagree:\n  - ${diffs.join("\n  - ")}`,
      );
    if (readings[0].sector !== file.sector || readings[0].year !== file.year)
      throw new Error(
        `the image says sector ${readings[0].sector}, ${readings[0].year}`,
      );
    return schedule(
      source,
      file,
      { doc, url: file.url, sha256: digest },
      readings[0].rows,
      MIASTO_ROWS,
      readings[0].streets,
    );
  },
};

const VISION_PROMPT = (image: string, rows: string[]) =>
  [
    `Read the waste collection schedule image ${image}. Do not modify any file and do not run commands.`,
    "Reply with ONE JSON object and nothing else, exactly this shape:",
    `{"sector": <sector number>, "year": <year>, "streets": [<every street name listed, as written>], "rows": {${rows
      .map((r) => `"${r}": [12 arrays of day numbers, January to December]`)
      .join(", ")}}}`,
    `Rows in table order: ${rows.join("; ")}. A cell with no date is []. Days are integers.`,
  ].join("\n");

/** The raw text of each pass (CURSOR_AGENT_MOCK: files instead, for tests). */
function visionPasses(
  source: Source,
  config: Config,
  file: Found,
  body: Buffer,
  rows: string[],
): string[] {
  const passes = config.vision.passes;
  const mock = process.env.CURSOR_AGENT_MOCK;
  if (mock)
    return passes.map((_, i) => {
      const f = path.join(
        mock,
        `${source.id}-s${file.sector}-${file.year}.pass-${i + 1}.json`,
      );
      if (!existsSync(f)) throw new Error(`mock pass ${i + 1} missing`);
      return readFileSync(f, "utf8");
    });
  if (!process.env.CURSOR_API_KEY)
    throw new Error(
      "CURSOR_API_KEY is not set, so the city JPG cannot be read automatically (repository secret).",
    );
  const models = spawnSync("agent", ["--list-models"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  for (const p of passes)
    if (!models.stdout?.includes(p.model))
      throw new Error(
        `model ${p.model} (${p.vendor}) is not in \`agent --list-models\`; update vision.passes in etl/sources.yaml`,
      );
  return passes.map((pass) => {
    // An empty workspace holding only the image; the agent may read it and
    // nothing else (no shell, writes, web or MCP). Everything else (git, DB,
    // S3, issues) is done by this script, never by the agent.
    const work = mkdtempSync(path.join(tmpdir(), "vision-"));
    writeFileSync(path.join(work, "schedule.jpg"), body);
    mkdirSync(path.join(work, ".cursor"));
    writeFileSync(
      path.join(work, ".cursor/cli.json"),
      JSON.stringify({
        permissions: {
          allow: ["Read(schedule.jpg)"],
          deny: ["Shell(*)", "Write(**)", "WebFetch(*)", "Mcp(*:*)"],
        },
      }),
    );
    const run = spawnSync(
      "agent",
      [
        "-p",
        "--output-format",
        "json",
        "--mode",
        "ask",
        "--trust",
        "--workspace",
        work,
        "--model",
        pass.model,
        VISION_PROMPT("./schedule.jpg", rows),
      ],
      { cwd: work, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 1 << 26 },
    );
    if (run.status !== 0)
      throw new Error(
        `${pass.model}: agent exited ${run.status}: ${(run.stderr ?? "").slice(0, 300)}`,
      );
    const result = String(
      (JSON.parse(run.stdout) as { result?: unknown }).result ?? "",
    );
    return result.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  });
}
