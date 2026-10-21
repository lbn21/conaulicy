// The waste schedule domain: the gmina's PDFs and the city's JPGs
// (docs/import.md).
import { transform } from "../../lib/import-data.ts";
import type { Domain, Extractor } from "../core/domain.ts";
import type { EventRow } from "../core/events.ts";
import {
  DETECTORS,
  detectFromPages,
  EXTRACTORS,
  type Extracted,
  type WasteSource,
} from "./adapters.ts";
import { check } from "./check.ts";

export const waste: Domain = {
  // Its sources are WasteSources (configErrors below checks them), and its
  // extractors read the sector and year its detectors add to each file.
  detectors: DETECTORS as unknown as Domain["detectors"],
  extractors: EXTRACTORS as unknown as Record<string, Extractor>,
  detectFromPages: detectFromPages as Domain["detectFromPages"],
  check,

  configErrors(source) {
    const s = source as WasteSource;
    const errors: string[] = [];
    for (const key of ["site", "file"] as const)
      if (!s.detect[key]) errors.push(`${s.id}.detect.${key}: required`);
    if (!s.waste) errors.push(`${s.id}.waste: required`);
    if (errors.length) return errors;
    const host = new URL(s.detect.site).host;
    // Public links are the original pages, never the archive.
    for (const [name, url] of [
      ["page", s.page],
      ...(s.watch ?? []).map((w) => ["watch", w.url]),
    ])
      if (new URL(url).host !== host)
        errors.push(`${s.id}.${name}: ${url} is not on ${host}`);
    for (const pattern of [s.detect.file, s.detect.postTitle]) {
      if (pattern === undefined) continue;
      try {
        new RegExp(pattern);
      } catch {
        errors.push(`${s.id}: invalid pattern ${pattern}`);
      }
    }
    if (
      !/\(\?<sector>/.test(s.detect.file) ||
      !/\(\?<year>/.test(s.detect.file)
    )
      errors.push(`${s.id}.detect.file: needs (?<sector>…) and (?<year>…)`);
    if (s.detect.type === "wp-media" && !s.detect.parent)
      errors.push(`${s.id}.detect: wp-media needs parent`);
    if (
      s.detect.type === "wp-post-files" &&
      !(s.detect.postSearch && s.detect.postTitle)
    )
      errors.push(
        `${s.id}.detect: wp-post-files needs postSearch and postTitle`,
      );
    return errors;
  },

  async afterDetect({ db, source, detection, issues, dryRun }) {
    if (dryRun) return false;
    // The public link: the config is the truth; the database follows it.
    const synced = await db.query(
      "update gminy set schedule_url = $1 where id = $2 and schedule_url is distinct from $1",
      [source.page, (source as WasteSource).waste.gmina.id],
    );
    if (detection.page && detection.page !== source.page)
      issues.raise(
        `${source.id}:page-link`,
        `${source.name}: nowa strona harmonogramu`,
        `The newest schedule post is ${detection.page}, but etl/sources.yaml links ${source.page}.\n\nSet \`page\` (and the first \`watch\` url) of source \`${source.id}\` to the new post in a PR; the site's link follows from it.`,
      );
    return Boolean(synced.rowCount);
  },

  rows({ out, zoneName, doc, checkedAt }) {
    const { zoneId, year, events } = out as Extracted;
    return transform(
      {
        gminy: [],
        localities: [],
        streets: [],
        zones: [{ id: zoneId, type: "waste", name: zoneName, members: [] }],
        events,
        meta: { year, sources: [] },
      },
      new Map([[doc, checkedAt]]),
    ).rows.events as EventRow[];
  },

  fixHint:
    "a config change in `etl/sources.yaml` or an approval in `etl/review/approvals.yaml`",
  coverageTitle: "harmonogram się kończy",
};
