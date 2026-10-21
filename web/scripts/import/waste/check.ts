// The waste domain's checks of one extracted schedule before it is applied
// (docs/import.md, "Validate"): dates against the rules in
// domains.waste.validate and approvals.yaml, and who the zone serves against
// the database. Each problem returned blocks the file; a city street list
// that differs only opens a review issue.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ROOT } from "../core/config.ts";
import type { Domain } from "../core/domain.ts";
import type { Extracted } from "./adapters.ts";
import {
  compareMembers,
  fold,
  streetKey,
  streetReview,
  type ValidationRules,
  validateSchedule,
} from "./lib.ts";

/** domains.waste in etl/sources.yaml. */
export type WasteSettings = {
  validate: ValidationRules & { counts: { minMonths: number } };
};

const approvalsFile = path.join(ROOT, "etl/review/approvals.yaml");
const anomalies = new Set(
  (
    ((existsSync(approvalsFile) &&
      parseYaml(readFileSync(approvalsFile, "utf8"))) ||
      {}) as {
      anomalies?: Array<{ zone_id: string; date: string }>;
    }
  ).anomalies?.map((a) => `${a.zone_id}|${a.date}`) ?? [],
);

export const check: Domain["check"] = async ({
  db,
  config,
  source,
  file,
  out: extracted,
  zoneName,
  issues,
  dryRun,
  runUrl,
}) => {
  const out = extracted as Extracted;
  const rules = (config.domains.waste as WasteSettings).validate;
  const checks = new Set(source.validate);
  if (!db)
    return validateSchedule({
      zoneId: out.zoneId,
      year: out.year,
      events: out.events,
      checks,
      rules,
      previous: null,
      anomalies,
    });
  const problems: string[] = [];
  const last = await db.query(
    "select subtype, count(*)::int as n, count(distinct substr(start, 1, 7))::int as months from events where zone_id = $1 and start like $2 group by subtype",
    [out.zoneId, `${out.year - 1}-%`],
  );
  const enough =
    Math.max(0, ...last.rows.map((r) => r.months)) >= rules.counts.minMonths;
  problems.push(
    ...validateSchedule({
      zoneId: out.zoneId,
      year: out.year,
      events: out.events,
      checks,
      rules,
      previous: enough
        ? new Map(last.rows.map((r) => [r.subtype as string, r.n as number]))
        : null,
      anomalies,
    }),
  );
  // Who the zone serves must not change without a person checking it.
  if (checks.has("villages") || checks.has("streets")) {
    const members = (
      await db.query(
        checks.has("villages")
          ? "select l.id, l.name from zone_members m join localities l on l.id = m.locality_id where m.zone_id = $1 and m.street_id is null and l.kind = 'wies'"
          : "select distinct s.id, s.name from zone_members m join streets s on s.id = m.street_id where m.zone_id = $1",
        [out.zoneId],
      )
    ).rows.map((r) => ({ id: r.id as string, names: [r.name as string] }));
    // A model's street spelling is never applied: differences open a
    // review issue that a person closes, and the dates still apply.
    const review = out.streetReadings
      ? streetReview(out.zoneId, out.streetReadings, members, source.aliases)
      : null;
    if (review?.length) {
      console.log(
        `\n${file.name}: streets may have changed:\n- ${review.join("\n- ")}`,
      );
      if (!dryRun)
        issues.raise(
          `streets:${out.zoneId}`,
          `${zoneName}: ulice mogły się zmienić`,
          [
            `The vision passes of **${file.name}** list streets that differ from **${out.zoneId}** in the database. This does not hold up the dates, which go through the usual checks; streets and zone membership come only from the database and were not changed.`,
            "",
            ...review.map((p) => `- ${p}`),
            "",
            "Check the image. If a street really joined or left the zone, change the database; if it is only spelt differently, add it to `aliases` in `etl/sources.yaml`. Then close this issue by hand: it is not closed automatically.",
            runUrl ? `\nRun: ${runUrl}` : "",
          ].join("\n"),
        );
    } else if (!review)
      problems.push(
        ...compareMembers(
          out.zoneId,
          out.listed,
          members,
          checks.has("villages") ? fold : streetKey,
          source.aliases,
        ),
      );
  }
  return problems;
};
