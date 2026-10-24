// The waste domain's checks of one extracted schedule before it is applied
// (docs/import.md, "Validate"): dates against the rules in
// domains.waste.validate and approvals.yaml, and who the zone serves against
// the database. Each problem returned blocks the file. A city JPG whose
// vision passes disagree is held for a review PR; a street list that differs
// opens an informational one (../core/review.ts).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Domain } from "../core/domain.ts";
import { ROOT } from "../core/paths.ts";
import type { Extracted, WasteSource } from "./adapters.ts";
import {
  compareMembers,
  compareReadings,
  databaseRows,
  disagreementTable,
  fold,
  MIASTO_ROWS,
  reviewedYaml,
  streetKey,
  streetLines,
  streetReview,
  type ValidationRules,
  validateSchedule,
} from "./lib.ts";

/** domains.waste in etl/sources.yaml. */
type WasteSettings = {
  coverageMinDays: number;
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
  source: anySource,
  file,
  digest,
  out: extracted,
  zoneName,
  reviews,
  runUrl,
}) => {
  const source = anySource as WasteSource;
  const out = extracted as Extracted;
  const rules = (config.domains.waste as WasteSettings).validate;
  const checks = new Set(source.waste.validate);
  const ids = config.vision.passes.map((p) => p.id);
  const readings = out.readings ?? [];
  const reviewFrom = readings[ids.indexOf(config.vision.reviewFrom)];
  if (!db && out.disagree)
    return [
      `the two vision passes (${ids.join(", ")}) disagree:\n  - ${compareReadings(readings[0], readings[1]).join("\n  - ")}`,
    ];
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
  const status = () => reviews.status(source.id, file.name, digest);
  const review = (blocking: boolean, markdown: string) =>
    reviews.open({
      source,
      file,
      digest,
      title: `${zoneName}: ${blocking ? "odczyty się różnią" : "ulice do sprawdzenia"} (${file.name})`,
      blocking,
      markdown,
      pageLabel: "Strona harmonogramu",
      ackNote:
        "Ulice i strefy biorą się wyłącznie z bazy; jeśli ulica naprawdę zmieniła strefę, popraw bazę, a jeśli to tylko inna pisownia, dodaj ją do `aliases` w `etl/sources.yaml`.",
      reviewed: reviewedYaml(
        out.disagree ? reviewFrom : readings[0],
        out.disagree ? config.vision.reviewFrom : ids.join(" = "),
        file.name,
        digest,
      ),
      runUrl,
    });
  const streetFindings = async () => {
    const members = (
      await db.query(
        "select distinct s.id, s.name from zone_members m join streets s on s.id = m.street_id where m.zone_id = $1",
        [out.zoneId],
      )
    ).rows.map((r) => ({ id: r.id as string, names: [r.name as string] }));
    return streetReview(
      out.zoneId,
      out.streetReadings ?? [],
      members,
      source.waste.aliases,
      [config.vision.streetCheckFrom],
    );
  };

  // Passes that disagree: nothing applies until a person decides in a PR.
  if (out.disagree) {
    const { rejected, merged } = status();
    if (rejected) {
      reviews.hold(
        digest,
        `its review was rejected (${rejected.url}); the database keeps its dates`,
        false,
      );
      return [];
    }
    if (merged) {
      reviews.hold(
        digest,
        `its review is merged (${merged.url}) but not in this checkout yet`,
        true,
      );
      return [];
    }
    const current = databaseRows(
      (
        await db.query(
          "select subtype, start from events where zone_id = $1 and start like $2",
          [out.zoneId, `${out.year}-%`],
        )
      ).rows,
      MIASTO_ROWS,
    );
    const streets = await streetFindings();
    const url = await review(
      true,
      [
        `### Daty, w których odczyty się różnią`,
        "",
        disagreementTable(readings, ids, current),
        ...(streets.length
          ? [
              "",
              "### Ulice (zawsze z bazy, tylko do wiadomości)",
              "",
              ...streetLines(streets),
            ]
          : []),
      ].join("\n"),
    );
    reviews.hold(
      digest,
      `the vision passes (${ids.join(", ")}) disagree; review PR: ${url}`,
      true,
    );
    return [];
  }

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
    // A model's street spelling is never applied: differences open an
    // informational review PR, and the dates still apply.
    if (out.streetReadings) {
      const streets = await streetFindings();
      if (!streets.length)
        reviews.supersede(
          source.id,
          file.name,
          digest,
          `Superseded: a newer version of ${file.name} (sha256 ${digest}) reads clean.${runUrl ? ` ${runUrl}` : ""}`,
        );
      else {
        const { rejected, merged } = status();
        console.log(
          `\n${file.name}: streets may have changed:\n- ${streets.join("\n- ")}`,
        );
        if (!rejected && !merged)
          console.log(
            `Review PR: ${await review(
              false,
              [
                "### Ulice, które różnią się od bazy",
                "",
                ...streetLines(streets),
                "",
                "Daty tego nie wstrzymują. Ulice i przynależność do stref pochodzą tylko z bazy i nie zostały zmienione.",
              ].join("\n"),
            )}`,
          );
      }
    } else {
      const members = (
        await db.query(
          checks.has("villages")
            ? "select l.id, l.name from zone_members m join localities l on l.id = m.locality_id where m.zone_id = $1 and m.street_id is null and l.kind = 'wies'"
            : "select distinct s.id, s.name from zone_members m join streets s on s.id = m.street_id where m.zone_id = $1",
          [out.zoneId],
        )
      ).rows.map((r) => ({ id: r.id as string, names: [r.name as string] }));
      problems.push(
        ...compareMembers(
          out.zoneId,
          out.listed,
          members,
          checks.has("villages") ? fold : streetKey,
          source.waste.aliases,
        ),
      );
    }
  }
  return problems;
};
